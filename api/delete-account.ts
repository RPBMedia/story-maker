/**
 * POST /api/delete-account — permanently delete the signed-in user's account.
 * Auth: Authorization: Bearer <supabase access token>
 *
 * Cancels any active Stripe subscription, then deletes the Supabase auth user
 * (the profiles row is removed automatically via the ON DELETE CASCADE from
 * 0001_profiles.sql). The client signs out afterward.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe, supabaseAdmin, requireUser } from "./_lib/server.js";

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
      .select("stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    const subId = profile?.stripe_subscription_id as string | undefined;
    if (subId) {
      try {
        await stripe.subscriptions.cancel(subId);
      } catch (e) {
        // Non-fatal: log and still delete the account.
        console.error("[delete-account] subscription cancel failed:", e);
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);

    return res.status(200).json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "unauthorized") {
      return res.status(401).json({ error: "Please sign in first." });
    }
    console.error("[delete-account]", message);
    return res.status(500).json({ error: "Could not delete the account." });
  }
}
