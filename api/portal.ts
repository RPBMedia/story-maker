/**
 * POST /api/portal — open the Stripe Customer Portal so the user can update or
 * cancel their subscription and see invoices.
 * Auth: Authorization: Bearer <supabase access token>
 * Returns: { url } — the portal page to redirect the browser to.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe, supabaseAdmin, requireUser, appUrl } from "./_lib/server.js";

/** True when Stripe reports the customer doesn't exist under the current key —
 * e.g. a customer id created in test mode is used with a live key after go-live. */
function isMissingCustomer(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "resource_missing" || /no such customer/i.test(e?.message ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return res
        .status(400)
        .json({ error: "No subscription found for this account yet." });
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: appUrl(req),
      });
      return res.status(200).json({ url: session.url });
    } catch (err) {
      if (!isMissingCustomer(err)) throw err;
      // The stored customer doesn't exist under the live key (test-mode residue
      // from before go-live). There's no live subscription, so self-heal the row
      // back to a clean free state and tell the user plainly.
      await admin
        .from("profiles")
        .update({
          plan: "free",
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: null,
          current_period_end: null,
        })
        .eq("id", user.id);
      return res.status(400).json({
        error:
          "We couldn't find an active subscription for this account. Your plan has been reset to Free — you can subscribe again anytime.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "unauthorized") {
      return res.status(401).json({ error: "Please sign in first." });
    }
    console.error("[portal]", message);
    return res.status(500).json({ error: "Could not open the billing portal." });
  }
}
