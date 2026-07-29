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

/** Google "G" mark (official four-colour), inline so it's CSP-safe. */
function GoogleIcon() {
  return (
    <svg
      className="oauth-btn__icon"
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

/** Apple logo, single-colour so it inherits the button text colour. */
function AppleIcon() {
  return (
    <svg
      className="oauth-btn__icon"
      width="16"
      height="16"
      viewBox="0 0 384 512"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.1 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
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
        className="btn btn--secondary btn--block oauth-btn"
        disabled={busy !== null || !config.authConfigured}
        onClick={() => go("google")}
      >
        <GoogleIcon />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--block oauth-btn"
        disabled={busy !== null || !config.authConfigured}
        onClick={() => go("apple")}
      >
        <AppleIcon />
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
