/**
 * POST /api/checkout — start a subscription.
 * Body: { plan: "creator" | "professional" }
 * Auth: Authorization: Bearer <supabase access token>
 * Returns: { url } — the Stripe Checkout page to redirect the browser to.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  stripe,
  supabaseAdmin,
  requireUser,
  priceForPlan,
  appUrl,
  type PlanId,
} from "./_lib/server.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    const plan = (req.body?.plan ?? "") as PlanId;
    const price = priceForPlan(plan);
    if (!price) {
      return res.status(400).json({ error: "Unknown or non-payable plan." });
    }

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();

    // Reuse the customer if we already made one, else create + persist it.
    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Upsert (not update): if the signup trigger never created this user's
      // row, a plain update would no-op and we'd lose the customer id, which in
      // turn breaks the webhook's customer-id fallback. Upsert guarantees the
      // row exists and carries the customer id.
      await admin
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? profile?.email ?? null,
            stripe_customer_id: customerId,
          },
          { onConflict: "id" },
        );
    }

    const base = appUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      success_url: `${base}/checkout/return?status=success`,
      cancel_url: `${base}/checkout/return?status=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "unauthorized") {
      return res.status(401).json({ error: "Please sign in first." });
    }
    console.error("[checkout]", message);
    return res.status(500).json({ error: "Could not start checkout." });
  }
}
