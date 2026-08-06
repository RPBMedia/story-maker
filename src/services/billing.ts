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

export type CheckoutOutcome = "success" | "cancelled" | "redirect";

/** Cross-window signalling keys, shared with the /checkout/return popup page. */
export const CHECKOUT_RESULT_KEY = "sm_checkout_result";
export const CHECKOUT_MESSAGE_TYPE = "sm-checkout";

/**
 * Start a subscription in a POPUP window so the editor tab — and its in-memory
 * media, which cannot survive a full-page redirect — stays alive. The popup
 * runs Stripe Checkout, then signals the outcome back to this tab and closes.
 * If the browser blocks the popup we fall back to a full-page redirect (which
 * loses editor state, so it is strictly the last resort).
 */
export async function startCheckout(plan: PaidPlan): Promise<CheckoutOutcome> {
  try {
    localStorage.removeItem(CHECKOUT_RESULT_KEY); // clear any stale result
  } catch {
    /* ignore */
  }
  // Open synchronously, within the click gesture, so it isn't blocked; we point
  // it at the real Checkout URL once the server responds.
  const popup = window.open("about:blank", "sm_checkout", "width=480,height=760");

  let url: string;
  try {
    url = await authedPost("/api/checkout", { plan });
  } catch (e) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    throw e;
  }

  if (!popup || popup.closed) {
    window.location.href = url; // popup blocked — last-resort full-page redirect
    return "redirect";
  }
  try {
    popup.location.href = url;
  } catch {
    window.location.href = url;
    return "redirect";
  }
  return waitForCheckoutOutcome(popup);
}

function readOutcome(raw: string | null): "success" | "cancelled" | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { status?: string };
    if (v.status === "success") return "success";
    if (v.status === "cancelled") return "cancelled";
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolve when the popup reports its outcome (via a localStorage storage event
 * — reliable even when Stripe's COOP severs window.opener — or postMessage), or
 * when the user closes the popup without completing. */
function waitForCheckoutOutcome(popup: Window): Promise<CheckoutOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      try {
        localStorage.removeItem(CHECKOUT_RESULT_KEY);
      } catch {
        /* ignore */
      }
      try {
        if (!popup.closed) popup.close();
      } catch {
        /* ignore */
      }
      resolve(outcome);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== CHECKOUT_RESULT_KEY) return;
      const o = readOutcome(e.newValue);
      if (o) finish(o);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; status?: string } | null;
      if (d?.type === CHECKOUT_MESSAGE_TYPE) {
        finish(d.status === "cancelled" ? "cancelled" : "success");
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);

    // Fallback: same-origin localStorage is shared, so poll it directly (covers
    // a result written before listeners attached), and treat a closed popup as
    // an abandoned checkout.
    const poll = window.setInterval(() => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(CHECKOUT_RESULT_KEY);
      } catch {
        /* ignore */
      }
      const pending = readOutcome(raw);
      if (pending) {
        finish(pending);
        return;
      }
      let closed = false;
      try {
        closed = popup.closed;
      } catch {
        closed = false;
      }
      if (closed) finish("cancelled");
    }, 500);
  });
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
