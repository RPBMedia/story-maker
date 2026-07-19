/** The export account gate. Modal-based so the in-memory project (uploaded
 * File objects) survives email/password authentication end to end. OAuth is
 * offered too, with an honest warning that its redirect reloads the page.
 * Closing is always possible and obvious — no dark patterns.
 */
import { useEffect, useRef, useState } from "react";
import { EmailPasswordForm, OAuthButtons, AuthUnconfiguredNote } from "./AuthForms";
import { analytics } from "../../services/analytics";

export function AccountGateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"sign-in" | "sign-up">("sign-up");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      analytics.track("account_gate_viewed");
      // move focus into the dialog for keyboard users
      dialogRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn--icon modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <h2 id="gate-title">Create a free account to render your video</h2>
        <p className="stage-sub">
          Your current project stays right here — nothing is uploaded and
          nothing is lost while you sign in.
        </p>
        <AuthUnconfiguredNote />
        <div className="gate-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sign-up"}
            className={`gate-tab${tab === "sign-up" ? " gate-tab--active" : ""}`}
            onClick={() => setTab("sign-up")}
          >
            Create account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sign-in"}
            className={`gate-tab${tab === "sign-in" ? " gate-tab--active" : ""}`}
            onClick={() => setTab("sign-in")}
          >
            Sign in
          </button>
        </div>
        <EmailPasswordForm mode={tab} onSuccess={onClose} />
        <div className="auth-divider" aria-hidden="true">
          or
        </div>
        <OAuthButtons onError={setOauthError} redirectWarning />
        {oauthError && (
          <p className="auth-error" role="alert">
            {oauthError}
          </p>
        )}
      </div>
    </div>
  );
}
