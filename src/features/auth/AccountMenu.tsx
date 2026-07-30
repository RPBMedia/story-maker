/** Header authentication control.
 *
 * Signed out (or account services unavailable): a compact "Sign in" /
 * "Create account" pair, visible from the very first screen — not gated
 * behind any editor step. Signed in: avatar/email + menu with sign-out and
 * placeholders for future account areas.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { usePlan } from "../plan/PlanContext";
import { PLAN_ORDER, entitlementsFor } from "../../services/entitlements";
import { analytics } from "../../services/analytics";

export function AccountMenu() {
  const { auth, signOut } = useAuth();
  const { plan, entitlements, isGod, override, setOverride, accountPlan } =
    usePlan();
  const [open, setOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (auth.status === "loading") {
    return (
      <span
        className="account-loading"
        aria-hidden="true"
        title="Checking your account…"
      />
    );
  }

  // "unconfigured" is treated the same as signed-out for entry-point
  // purposes: the buttons are always present; the destination page explains
  // any unavailability gracefully rather than hiding the entry point.
  if (auth.status === "signed-out" || auth.status === "unconfigured") {
    return (
      <div className="auth-entry">
        <Link
          className="btn btn--secondary"
          to="/auth/sign-in"
          onClick={() => analytics.track("auth_entry_clicked", { action: "sign-in" })}
        >
          Sign in
        </Link>
        <Link
          className="btn btn--primary"
          to="/auth/sign-up"
          onClick={() => analytics.track("auth_entry_clicked", { action: "sign-up" })}
        >
          Create account
        </Link>
      </div>
    );
  }

  const label = auth.profile?.displayName || auth.email || "Account";
  const initial = (label[0] ?? "?").toUpperCase();

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {auth.profile?.avatarUrl && !avatarBroken ? (
          <img
            className="account__avatar"
            src={auth.profile.avatarUrl}
            alt=""
            // Google avatar URLs (lh3.googleusercontent.com) 403 when a
            // referrer header is sent from localhost/other origins.
            referrerPolicy="no-referrer"
            // If the image still fails for any reason, fall back to the
            // initial instead of showing a broken-image icon.
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <span className="account__avatar account__avatar--initial" aria-hidden="true">
            {initial}
          </span>
        )}
        <span className="account__label">{label}</span>
      </button>
      {open && (
        <div className="account__menu card" role="menu">
          <span className="account__menu-note">Signed in as {auth.email}</span>

          {isGod ? (
            <div className="plan-switch">
              <span className="plan-switch__label">
                <span className="plan-switch__god" aria-hidden="true">
                  ⚡ God mode
                </span>
                Testing as <strong>{entitlements.label}</strong>
              </span>
              <div
                className="plan-switch__options"
                role="group"
                aria-label="Switch plan"
              >
                {PLAN_ORDER.map((p) => {
                  const e = entitlementsFor(p);
                  const active = plan === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`plan-switch__btn${active ? " plan-switch__btn--active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setOverride(p)}
                    >
                      <span className="plan-switch__name">{e.label}</span>
                      <span className="plan-switch__price">
                        {e.priceMonthly === 0 ? "Free" : `$${e.priceMonthly}/mo`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {override && (
                <button
                  type="button"
                  className="plan-switch__reset"
                  onClick={() => setOverride(null)}
                >
                  Reset to my account plan
                </button>
              )}
            </div>
          ) : (
            <span className="account__plan-note">
              Plan: <strong>{entitlements.label}</strong>
              {entitlements.priceMonthly > 0
                ? ` · $${entitlements.priceMonthly}/mo`
                : ""}
            </span>
          )}

          <Link
            to="/account"
            role="menuitem"
            className="account__item"
            onClick={() => setOpen(false)}
          >
            Account &amp; billing
          </Link>
          {accountPlan !== "free" && (
            <Link
              to="/account"
              role="menuitem"
              className="account__item"
              onClick={() => setOpen(false)}
            >
              Manage subscription
            </Link>
          )}
          <button type="button" role="menuitem" className="account__item" disabled>
            My Projects (coming soon)
          </button>
          <button
            type="button"
            role="menuitem"
            className="account__item account__item--danger"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
