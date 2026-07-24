/** Shared auth form pieces: email/password fields, OAuth buttons, errors.
 * Used by both the standalone /auth pages and the in-editor account gate so
 * the two stay visually and behaviorally identical.
 */
import { useState, type FormEvent } from "react";
import { useAuth, OAUTH_CANCELLED, OAUTH_POPUP_BLOCKED } from "./AuthContext";
import { config } from "../../config/env";

/** Inline note shown near auth forms when Supabase isn't configured.
 *
 * DEV: names the exact missing variables so the developer can fix it fast.
 * PROD: calm, non-technical — this is what a real visitor would ever see,
 * so it must never leak configuration details (see the "Missing Supabase
 * configuration" requirement). */
export function AuthUnconfiguredNote() {
  if (config.authConfigured) return null;
  if (import.meta.env.DEV) {
    return (
      <p className="auth-note" role="note">
        <strong>Developer note:</strong> Supabase isn't configured — missing{" "}
        <code>{config.missingEnvVars.join("</code>, <code>")}</code>. Copy{" "}
        <code>.env.example</code> to <code>.env</code> and fill in your
        project values (README → Supabase setup).
      </p>
    );
  }
  return (
    <p className="auth-note" role="note">
      Account services are temporarily unavailable. Please try again shortly.
    </p>
  );
}

/** Calm, non-error banner for the Export screen when account services are
 * unreachable — distinct in tone and placement from render-time guidance. */
export function AccountUnavailableNotice({ message }: { message: string }) {
  return (
    <div className="account-notice account-notice--unavailable" role="status">
      <span className="account-notice__icon" aria-hidden="true">
        🔧
      </span>
      <div>
        <p className="account-notice__title">{message}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export function OAuthButtons({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  /** Called after a successful popup sign-in (the main window never left). */
  onSuccess?: () => void;
}) {
  const { signInWithOAuth } = useAuth();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  async function go(provider: "google" | "apple") {
    setBusy(provider);
    const err = await signInWithOAuth(provider);
    setBusy(null);
    if (err === OAUTH_CANCELLED) return; // user closed the popup; stay silent
    if (err === OAUTH_POPUP_BLOCKED) {
      onError(
        "Your browser blocked the sign-in popup. Please allow popups for this site and try again — or use email and password below, which keeps your project in place.",
      );
      return;
    }
    if (err) {
      onError(err);
      return;
    }
    // Popup sign-in succeeded and the main window (and your whole project) is
    // still here — hand back to the caller to close the gate / navigate.
    onSuccess?.();
  }

  return (
    <div className="oauth-buttons">
      <button
        type="button"
        className="btn btn--secondary btn--block"
        disabled={busy !== null || !config.authConfigured}
        onClick={() => go("google")}
      >
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--block"
        disabled={busy !== null || !config.authConfigured}
        onClick={() => go("apple")}
      >
        {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
      </button>
    </div>
  );
}

export function EmailPasswordForm({
  mode,
  onSuccess,
}: {
  mode: "sign-in" | "sign-up";
  onSuccess?: () => void;
}) {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    if (mode === "sign-up") {
      if (password.length < 8) {
        setError("Use a password of at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The passwords don't match.");
        return;
      }
    }
    setBusy(true);
    const err =
      mode === "sign-in"
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);
    setBusy(false);
    if (err === "CONFIRM_EMAIL") {
      setInfo(
        "Almost there — we've sent a confirmation link to your email. Confirm it, then sign in here.",
      );
      return;
    }
    if (err) {
      setError(err);
      return;
    }
    onSuccess?.();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          required
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {mode === "sign-up" && (
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="auth-note" role="status">
          {info}
        </p>
      )}
      <button
        type="submit"
        className="btn btn--primary btn--block"
        disabled={busy || !config.authConfigured}
      >
        {busy
          ? mode === "sign-in"
            ? "Signing in…"
            : "Creating account…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>
      {mode === "sign-up" && (
        <p className="auth-fineprint">
          By creating an account you agree to StoryMaker's terms of service and
          privacy policy (placeholders — final documents to come).
        </p>
      )}
    </form>
  );
}
