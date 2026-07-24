/** The page the OAuth popup lands on after the provider round-trip.
 *
 * When this route loads, the Supabase client (constructed with
 * detectSessionInUrl: true) processes the tokens from the URL and writes the
 * session to localStorage. That write fires a cross-window storage event, so
 * the MAIN window — which never navigated away — sees the new session and
 * updates instantly. This little page just confirms the session landed, then
 * closes itself.
 */
import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

export function OAuthPopupCallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      if (session || tries > 25) {
        window.clearInterval(timer);
        // Give the storage event a beat to propagate to the opener, then close.
        window.setTimeout(() => {
          window.close();
          // If the browser refuses to close a script-opened window in some
          // configuration, surface a manual close.
          window.setTimeout(() => setStuck(true), 400);
        }, 150);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="topbar__brand auth-brand">
          <span className="topbar__logo" aria-hidden="true">
            ▶
          </span>
          <h1>StoryMaker</h1>
        </div>
        <h2>You're signed in</h2>
        <p className="stage-sub">
          {stuck
            ? "All set — you can close this window and return to StoryMaker."
            : "Finishing up… this window will close automatically."}
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
