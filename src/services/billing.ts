/** Client → billing serverless functions.
 *
 * The browser never sets a plan; it only asks the server to start a Stripe
 * Checkout (to subscribe) or open the Customer Portal (to manage/cancel). The
 * user's Supabase access token authenticates the call; the server does the
 * rest and the webhook is what actually grants the plan.
 */
import { supabase } from "./supabase";
import type { PlanId } from "../types";

export type PaidPlan = Exclude<PlanId, "free">;

async function authedPost(path: string, body: unknown): Promise<string> {
  if (!supabase) throw new Error("Account services are unavailable right now.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Please sign in first.");

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "Something went wrong. Please try again.");
  }
  return json.url;
}

/** Start a subscription: redirects the browser to Stripe Checkout. */
export async function startCheckout(plan: PaidPlan): Promise<void> {
  const url = await authedPost("/api/checkout", { plan });
  window.location.href = url;
}

/** Open the Stripe Customer Portal to update or cancel a subscription. */
export async function openBillingPortal(): Promise<void> {
  const url = await authedPost("/api/portal", {});
  window.location.href = url;
}

/** Permanently delete the signed-in account (cancels any subscription too). */
export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error("Account services are unavailable right now.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Please sign in first.");
  const res = await fetch("/api/delete-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "Could not delete the account.");
  }
}
