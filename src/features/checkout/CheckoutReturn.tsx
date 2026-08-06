/** Landing page for the Stripe Checkout popup.
 *
 * Checkout runs in a popup so the editor tab never unloads (its in-memory media
 * can't survive a full-page redirect). Stripe redirects the popup here on
 * success/cancel; this page signals the outcome back to the opener and closes
 * itself, leaving the editor exactly where it was — one click from Export.
 */
import { useEffect, useState } from "react";
import {
  CHECKOUT_MESSAGE_TYPE,
  CHECKOUT_RESULT_KEY,
} from "../../services/billing";

export function CheckoutReturn() {
  const [stuck, setStuck] = useState(false);
  const status =
    new URLSearchParams(window.location.search).get("status") === "cancelled"
      ? "cancelled"
      : "success";

  useEffect(() => {
    // localStorage is the reliable channel: Stripe's COOP can sever
    // window.opener, but a storage write still reaches every same-origin tab.
    try {
      localStorage.setItem(
        CHECKOUT_RESULT_KEY,
        JSON.stringify({ status, t: Date.now() }),
      );
    } catch {
      /* ignore */
    }
    // postMessage is a best-effort extra for when the opener survives.
    try {
      window.opener?.postMessage(
        { type: CHECKOUT_MESSAGE_TYPE, status },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => {
      window.close();
      // Some browsers refuse to close a script-opened window; offer a manual close.
      window.setTimeout(() => setStuck(true), 400);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="topbar__brand auth-brand">
          <span className="topbar__logo" aria-hidden="true">
            ▶
          </span>
          <h1>StoryMaker</h1>
        </div>
        <h2>{status === "success" ? "Payment received" : "Checkout cancelled"}</h2>
        <p className="stage-sub">
          {stuck
            ? "All set — you can close this window and return to StoryMaker."
            : status === "success"
              ? "Unlocking your plan… this window will close automatically."
              : "No charge was made. This window will close automatically."}
        </p>
        {stuck && (
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => window.close()}
          >
            Close window
          </button>
        )}
      </div>
    </div>
  );
}
