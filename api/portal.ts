/**
 * POST /api/portal — open the Stripe Customer Portal so the user can update or
 * cancel their subscription and see invoices.
 * Auth: Authorization: Bearer <supabase access token>
 * Returns: { url } — the portal page to redirect the browser to.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe, supabaseAdmin, requireUser, appUrl } from "./_lib/server.js";

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

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: appUrl(req),
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "unauthorized") {
      return res.status(401).json({ error: "Please sign in first." });
    }
    console.error("[portal]", message);
    return res.status(500).json({ error: "Could not open the billing portal." });
  }
}
