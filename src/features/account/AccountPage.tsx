/** Account & billing page (/account).
 *
 * Shows the user's real plan (from Supabase), lets them manage or start a
 * subscription via Stripe, change their password, sign out, and delete their
 * account. Reachable from the header account menu.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePlan } from "../plan/PlanContext";
import { entitlementsFor, PLAN_ORDER } from "../../services/entitlements";
import {
  startCheckout,
  openBillingPortal,
  deleteAccount,
} from "../../services/billing";
import { formatDuration } from "../../utils/format";

export function AccountPage() {
  const { auth, updatePassword, signOut, reloadProfile } = useAuth();
  const { accountPlan } = usePlan();
  const navigate = useNavigate();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  if (auth.status === "loading") {
    return (
      <AccountShell>
        <p className="stage-sub">Checking your account…</p>
      </AccountShell>
    );
  }
  if (auth.status !== "signed-in") {
    return (
      <AccountShell>
        <p className="stage-sub">You’re signed out.</p>
        <Link to="/auth/sign-in" className="btn btn--primary">
          Sign in
        </Link>
      </AccountShell>
    );
  }

  const ent = entitlementsFor(accountPlan);
  const isPaid = accountPlan !== "free";

  async function run(key: string, fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  /** Upgrade from the account page. Checkout runs in a popup (this tab stays
   * put); on success we poll the profile so the plan updates in place. */
  async function upgrade(plan: "creator" | "professional") {
    const outcome = await startCheckout(plan);
    if (outcome !== "success") return;
    for (const ms of [0, 1500, 3000, 5000]) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      await reloadProfile();
    }
    setNotice("Your plan is active.");
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    await run("password", async () => {
      const err = await updatePassword(newPassword);
      if (err) throw new Error(err);
      setNewPassword("");
      setNotice("Password updated.");
    });
  }

  async function onDelete() {
    if (
      !window.confirm(
        "Delete your account permanently? This cancels any subscription and cannot be undone.",
      )
    ) {
      return;
    }
    await run("delete", async () => {
      await deleteAccount();
      await signOut();
      navigate("/");
    });
  }

  return (
    <AccountShell>
      <h1>Account &amp; billing</h1>
      <p className="legal-updated">Signed in as {auth.email}</p>

      {notice && (
        <p className="account-msg account-msg--ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="account-msg account-msg--err" role="alert">
          {error}
        </p>
      )}

      {/* ---- current plan ---- */}
      <section className="account-block">
        <div className="account-plan-row">
          <div>
            <span className="eyebrow-inline">Your plan</span>
            <div className="account-plan-name">{ent.label}</div>
          </div>
          <div className="account-plan-price">
            {ent.priceMonthly === 0 ? "Free" : `$${ent.priceMonthly}/mo`}
          </div>
        </div>
        <ul className="account-plan-includes">
          <li>
            Videos up to{" "}
            <strong>
              {ent.maxProjectDurationSeconds === null
                ? "unlimited length"
                : formatDuration(ent.maxProjectDurationSeconds)}
            </strong>
          </li>
          <li>
            <strong>
              {ent.maxAudioTracks === null
                ? "Multiple"
                : ent.maxAudioTracks}
            </strong>{" "}
            audio track{ent.maxAudioTracks === 1 ? "" : "s"}
          </li>
          <li>
            {ent.maxResolution.width}×{ent.maxResolution.height} ·{" "}
            {ent.maxFps} fps
          </li>
          <li>{ent.watermark ? "Includes watermark" : "No watermark"}</li>
        </ul>

        {isPaid ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy !== null}
            onClick={() => run("portal", openBillingPortal)}
          >
            {busy === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        ) : (
          <div className="account-upgrade-row">
            {PLAN_ORDER.filter((p) => p !== "free").map((p) => {
              const e = entitlementsFor(p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`btn ${p === "creator" ? "btn--primary" : ""}`}
                  disabled={busy !== null}
                  onClick={() =>
                    run(`up-${p}`, () =>
                      upgrade(p as "creator" | "professional"),
                    )
                  }
                >
                  {busy === `up-${p}`
                    ? "Opening checkout…"
                    : `Upgrade to ${e.label} — $${e.priceMonthly}/mo`}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- password ---- */}
      <section className="account-block">
        <h2>Change password</h2>
        <form className="account-form" onSubmit={onChangePassword}>
          <input
            type="password"
            className="field-input"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            type="submit"
            className="btn"
            disabled={busy !== null || newPassword.length === 0}
          >
            {busy === "password" ? "Saving…" : "Update password"}
          </button>
        </form>
        <p className="stage-sub">
          If you signed up with Google or Apple, setting a password lets you also
          sign in with email.
        </p>
      </section>

      {/* ---- danger zone ---- */}
      <section className="account-block">
        <h2>Danger zone</h2>
        <div className="account-danger">
          <button
            type="button"
            className="btn"
            onClick={() => run("signout", signOut)}
          >
            Sign out
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy !== null}
            onClick={onDelete}
          >
            {busy === "delete" ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </section>
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <div className="bg-ambient" aria-hidden="true" />
      <div className="legal-shell">
        <header className="legal-topbar">
          <Link to="/" className="legal-brand">
            <span className="topbar__logo" aria-hidden="true">
              ▶
            </span>
            StoryMaker
          </Link>
          <Link to="/" className="btn btn--secondary">
            Back to app
          </Link>
        </header>
        <article className="legal account card">{children}</article>
      </div>
    </div>
  );
}
