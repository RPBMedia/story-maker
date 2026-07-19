/** Standalone auth routes: /auth/sign-in, /auth/sign-up,
 * /auth/forgot-password, /auth/reset-password. Same design language as the
 * editor — dark shell, same buttons, same typography.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  AuthUnconfiguredNote,
  EmailPasswordForm,
  OAuthButtons,
} from "./AuthForms";
import { config } from "../../config/env";

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="topbar__brand auth-brand">
          <span className="topbar__logo" aria-hidden="true">
            ▶
          </span>
          <h1>StoryMaker</h1>
        </div>
        <h2>{title}</h2>
        <AuthUnconfiguredNote />
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const [oauthError, setOauthError] = useState<string | null>(null);
  return (
    <AuthShell title="Sign in">
      <EmailPasswordForm mode="sign-in" onSuccess={() => navigate("/")} />
      <div className="auth-divider" aria-hidden="true">
        or
      </div>
      <OAuthButtons onError={setOauthError} />
      {oauthError && (
        <p className="auth-error" role="alert">
          {oauthError}
        </p>
      )}
      <p className="auth-links">
        <Link to="/auth/sign-up">Create an account</Link>
        <Link to="/auth/forgot-password">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [oauthError, setOauthError] = useState<string | null>(null);
  return (
    <AuthShell title="Create your account">
      <EmailPasswordForm mode="sign-up" onSuccess={() => navigate("/")} />
      <div className="auth-divider" aria-hidden="true">
        or
      </div>
      <OAuthButtons onError={setOauthError} />
      {oauthError && (
        <p className="auth-error" role="alert">
          {oauthError}
        </p>
      )}
      <p className="auth-links">
        <Link to="/auth/sign-in">Already have an account? Sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await requestPasswordReset(email);
    setBusy(false);
    if (err) setError(err);
    else setDone(true);
  }

  return (
    <AuthShell title="Reset your password">
      {done ? (
        <p className="auth-note" role="status">
          If an account exists for <strong>{email}</strong>, a reset link is on
          its way. Open it on this device to choose a new password.
        </p>
      ) : (
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
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={busy || !config.authConfigured}
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/auth/sign-in">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { updatePassword, auth } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err);
    else navigate("/");
  }

  return (
    <AuthShell title="Choose a new password">
      {auth.status !== "signed-in" && (
        <p className="auth-note" role="note">
          Open this page from the link in your reset email. If the link has
          expired, request a new one.
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={busy || !config.authConfigured}
        >
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/auth/forgot-password">Request a new link</Link>
      </p>
    </AuthShell>
  );
}
