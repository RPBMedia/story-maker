/** Compact header account control: avatar/email + menu with sign-out and
 * placeholders for future account areas. */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function AccountMenu() {
  const { auth, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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

  if (auth.status === "unconfigured") return null;
  if (auth.status === "loading") {
    return <span className="account-loading" aria-hidden="true" />;
  }
  if (auth.status === "signed-out") {
    return (
      <Link className="btn btn--secondary" to="/auth/sign-in">
        Sign in
      </Link>
    );
  }

  const label =
    auth.profile?.displayName || auth.email || "Account";
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
        {auth.profile?.avatarUrl ? (
          <img className="account__avatar" src={auth.profile.avatarUrl} alt="" />
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
          <button type="button" role="menuitem" className="account__item" disabled>
            My Projects (coming soon)
          </button>
          <button type="button" role="menuitem" className="account__item" disabled>
            Usage (coming soon)
          </button>
          <button type="button" role="menuitem" className="account__item" disabled>
            Account Settings (coming soon)
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
