/** The export account gate. Modal-based so the in-memory project (uploaded
 * File objects) survives email/password authentication end to end. OAuth is
 * offered too, with an honest warning that its redirect reloads the page.
 * Closing is always possible and obvious — no dark patterns.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmailPasswordForm, OAuthButtons, AuthUnconfiguredNote } from "./AuthForms";
import { analytics } from "../../services/analytics";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export function AccountGateModal({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  /** Called once, after a successful sign-in/sign-up, just before onClose. */
  onAuthenticated?: () => void;
}) {
  const [tab, setTab] = useState<"sign-in" | "sign-up">("sign-up");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      analytics.track("export_auth_gate_viewed");
      analytics.track(tab === "sign-up" ? "sign_up_viewed" : "sign_in_viewed", {
        context: "export-gate",
      });
      // move focus into the dialog for keyboard users
      dialogRef.current?.focus();
    } else {
      // Return focus to whatever opened the gate (the Generate Video /
      // Start Rendering trigger), per accessibility requirements.
      previouslyFocused.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleAuthenticated() {
    analytics.track("export_auth_gate_completed");
    onAuthenticated?.();
    onClose();
  }

  function switchTab(next: "sign-in" | "sign-up") {
    setTab(next);
    analytics.track(next === "sign-up" ? "sign_up_viewed" : "sign_in_viewed", {
      context: "export-gate",
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-desc"
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
        <h2 id="gate-title">Sign in to export your video</h2>
        <p id="gate-desc" className="stage-sub">
          Create a free account or sign in to render and download this project.
          Your soundtrack, media, transitions, and zoom settings will remain in
          place.
        </p>
        <AuthUnconfiguredNote />
        <div className="gate-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sign-up"}
            className={`gate-tab${tab === "sign-up" ? " gate-tab--active" : ""}`}
            onClick={() => switchTab("sign-up")}
          >
            Create account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sign-in"}
            className={`gate-tab${tab === "sign-in" ? " gate-tab--active" : ""}`}
            onClick={() => switchTab("sign-in")}
          >
            Sign in
          </button>
        </div>
        <EmailPasswordForm mode={tab} onSuccess={handleAuthenticated} />
        {tab === "sign-in" && (
          <p className="auth-links">
            {/* Project state survives this route change: ProjectProvider is
                mounted above the router, so leaving for the reset flow and
                returning keeps the soundtrack/media/effects intact. */}
            <Link to="/auth/forgot-password" onClick={onClose}>
              Forgot your password?
            </Link>
          </p>
        )}
        <div className="auth-divider" aria-hidden="true">
          or
        </div>
        <OAuthButtons onError={setOauthError} onSuccess={handleAuthenticated} />
        {oauthError && (
          <p className="auth-error" role="alert">
            {oauthError}
          </p>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--block gate-dismiss"
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
