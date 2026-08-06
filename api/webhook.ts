/**
 * POST /api/webhook — Stripe → StoryMaker source of truth for plan changes.
 *
 * Stripe calls this after a checkout completes or a subscription changes. We
 * verify the signature (so nobody can forge plan upgrades), then write the
 * resulting plan + subscription state to the user's profile with the
 * service-role key. This is the ONLY thing that actually grants a paid plan —
 * the client never sets its own plan.
 *
 * We read the RAW request body (no JSON parsing) because Stripe's signature is
 * computed over the exact bytes.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import {
  stripe,
  supabaseAdmin,
  readRawBody,
  planForPrice,
  type PlanId,
} from "./_lib/server.js";

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not set");
    return res.status(500).send("Webhook not configured");
  }

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    console.error("[webhook] signature verification failed:", message);
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await applySubscription(sub, session.client_reference_id ?? null);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(sub, null);
        break;
      }
      default:
        break; // ignore other events
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[webhook] handler error:", err);
    // 500 tells Stripe to retry — the event isn't lost.
    return res.status(500).send("Handler error");
  }
}

/** Resolve the plan from a subscription and write it to the user's profile. */
async function applySubscription(
  sub: Stripe.Subscription,
  clientReferenceId: string | null,
): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id;
  const canceled =
    sub.status === "canceled" ||
    sub.status === "incomplete_expired" ||
    sub.status === "unpaid";
  const plan: PlanId =
    !canceled && ACTIVE_STATUSES.has(sub.status)
      ? planForPrice(priceId)
      : "free";

  const userId =
    clientReferenceId ||
    (sub.metadata?.supabase_user_id as string | undefined) ||
    null;
  const customerId = sub.customer as string;

  const fields = {
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: canceled ? null : sub.id,
    subscription_status: sub.status,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  const admin = supabaseAdmin();
  // Prefer the user id (from checkout/subscription metadata). We UPSERT rather
  // than UPDATE: a plain update silently matches zero rows if the profile row
  // is missing (e.g. the signup trigger never ran for this user), which would
  // leave a paying customer on the free plan while the webhook still returns
  // 200. Upserting by primary key creates-or-updates, so the grant always lands.
  if (userId) {
    const { error } = await admin
      .from("profiles")
      .upsert({ id: userId, ...fields }, { onConflict: "id" });
    if (error) throw new Error(`profiles upsert failed: ${error.message}`);
    return;
  }

  // No user id on the event — fall back to the Stripe customer id we stored at
  // checkout. We can't create a row without the auth user id, so require a
  // match and fail loudly (500 → Stripe retries) instead of a silent no-op.
  const { data, error } = await admin
    .from("profiles")
    .update(fields)
    .eq("stripe_customer_id", customerId)
    .select("id");
  if (error) throw new Error(`profiles update failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      `no profile matched customer ${customerId} and no user id on event`,
    );
  }
}
