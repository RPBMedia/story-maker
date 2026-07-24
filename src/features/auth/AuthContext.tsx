import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, humanAuthError } from "../../services/supabase";
import { config, authRedirectUrl } from "../../config/env";
import { analytics } from "../../services/analytics";
import type { AuthState, UserProfile } from "../../types";

/** Calm, non-technical copy for "the auth backend genuinely isn't reachable
 * right now" — never names environment variables. The DEV-only technical
 * detail lives solely in config/env.ts's console diagnostic. */
export const ACCOUNT_SERVICE_UNAVAILABLE =
  "Account services are temporarily unavailable. Please try again shortly.";

/** signInWithOAuth sentinels the caller handles specially (not error copy). */
export const OAUTH_POPUP_BLOCKED = "OAUTH_POPUP_BLOCKED";
export const OAUTH_CANCELLED = "OAUTH_CANCELLED";

export interface AuthApi {
  /** Status, user id, email, and (once loaded) profile row. */
  auth: AuthState;
  /** Convenience flag: auth.status === "loading". */
  loading: boolean;
  /** The raw Supabase session (tokens etc.), when signed in. Kept separate
   * from AuthState so the app-wide state model stays simple/serializable. */
  session: Session | null;
  signInWithPassword(email: string, password: string): Promise<string | null>;
  signUpWithPassword(email: string, password: string): Promise<string | null>;
  signInWithOAuth(provider: "google" | "apple"): Promise<string | null>;
  requestPasswordReset(email: string): Promise<string | null>;
  updatePassword(newPassword: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

function stateFromSession(session: Session | null): AuthState {
  if (!session?.user) {
    return { status: "signed-out", userId: null, email: null, profile: null };
  }
  // Build an immediate profile from the session's own user_metadata. For
  // OAuth (Google/Apple) this already carries the display name and avatar, so
  // the header shows them instantly and correctly WITHOUT depending on the
  // `profiles` table row (whose trigger may not have captured the provider's
  // `picture` claim). The async profiles-table load below enriches this with
  // plan / export_count.
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;
  return {
    status: "signed-in",
    userId: session.user.id,
    email: session.user.email ?? null,
    profile: {
      id: session.user.id,
      email: session.user.email ?? null,
      displayName: str(meta.full_name) ?? str(meta.name),
      avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
      plan: "free",
      exportCount: 0,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() =>
    config.authConfigured
      ? { status: "loading", userId: null, email: null, profile: null }
      : { status: "unconfigured", userId: null, email: null, profile: null },
  );
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;

    supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      setAuth(stateFromSession(data.session));
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      setAuth(stateFromSession(session));
      setSession(session);
      // Supabase records which provider authenticated the session, so this
      // fires correctly even after a real OAuth redirect reloads the page
      // (no in-memory "pending" flag would survive that reload).
      const provider = session?.user.app_metadata?.provider;
      if (event === "SIGNED_IN" && provider && provider !== "email") {
        analytics.track("oauth_completed", { provider });
      }
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Enrich the (already session-derived) profile with the DB row's plan /
  // export_count. Runs once per signed-in user; merges rather than
  // overwrites, so the session's avatar/name survive even when the profiles
  // row lacks them. Best-effort; RLS scopes the read to the user's own row.
  const profileLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || auth.status !== "signed-in" || !auth.userId) return;
    if (profileLoadedFor.current === auth.userId) return;
    profileLoadedFor.current = auth.userId;
    let disposed = false;
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, plan, export_count")
      .eq("id", auth.userId)
      .maybeSingle()
      .then(({ data }) => {
        if (disposed || !data) return;
        setAuth((cur) => {
          if (cur.userId !== data.id) return cur;
          const merged: UserProfile = {
            id: data.id,
            email: data.email ?? cur.profile?.email ?? null,
            // prefer whatever is non-empty; session metadata usually wins for
            // OAuth avatars, the DB row for a user's later customizations
            displayName: cur.profile?.displayName ?? data.display_name ?? null,
            avatarUrl: cur.profile?.avatarUrl ?? data.avatar_url ?? null,
            plan: data.plan ?? "free",
            exportCount: data.export_count ?? 0,
          };
          return { ...cur, profile: merged };
        });
      });
    return () => {
      disposed = true;
    };
  }, [auth.status, auth.userId]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return ACCOUNT_SERVICE_UNAVAILABLE;
      analytics.track("sign_in_started", { method: "password" });
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        analytics.track("sign_in_failed", { method: "password" });
        return humanAuthError(error);
      }
      analytics.track("sign_in_completed", { method: "password" });
      return null;
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return ACCOUNT_SERVICE_UNAVAILABLE;
      analytics.track("sign_up_started", { method: "password" });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectUrl("/") },
      });
      if (error) {
        analytics.track("sign_up_failed", { method: "password" });
        return humanAuthError(error);
      }
      analytics.track("sign_up_completed", { method: "password" });
      // When email confirmation is enabled, no session exists yet.
      if (!data.session) {
        return "CONFIRM_EMAIL";
      }
      return null;
    },
    [],
  );

  /**
   * OAuth via a POPUP window rather than a full-page redirect. This keeps the
   * main window — and therefore the entire in-memory project (uploaded File
   * objects, sequence, effects, everything) — alive across sign-in. The popup
   * lands on /auth/popup-callback, which lets Supabase process the tokens and
   * then closes itself; the main window observes the new session (a
   * cross-window storage event fires onAuthStateChange) and we resolve.
   *
   * Returns null on success, OAUTH_POPUP_BLOCKED / OAUTH_CANCELLED sentinels
   * for the caller to handle, or a human error string otherwise.
   */
  const signInWithOAuth = useCallback(
    async (provider: "google" | "apple"): Promise<string | null> => {
      if (!supabase) return ACCOUNT_SERVICE_UNAVAILABLE;
      const client = supabase; // stable non-null ref for the async closures
      analytics.track("oauth_started", { provider });

      // The popup MUST be opened synchronously inside the click gesture, before
      // any await — otherwise the browser blocks it as non-user-initiated.
      const popup = window.open(
        "about:blank",
        "storymaker-oauth",
        "width=500,height=680,menubar=no,toolbar=no,location=no,status=no",
      );
      if (!popup) {
        analytics.track("oauth_failed", { provider, reason: "popup_blocked" });
        return OAUTH_POPUP_BLOCKED;
      }

      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authRedirectUrl("/auth/popup-callback"),
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        try {
          popup.close();
        } catch {
          /* noop */
        }
        analytics.track("oauth_failed", { provider });
        return error
          ? humanAuthError(error)
          : "Couldn't start sign-in. Please try again.";
      }
      popup.location.href = data.url;

      // Wait for the popup to deliver a session or to be closed/cancelled.
      return await new Promise<string | null>((resolve) => {
        const startedAt = Date.now();
        const timer = window.setInterval(async () => {
          let closed = false;
          try {
            closed = popup.closed;
          } catch {
            /* COOP can hide this; the getSession check below still works */
          }
          const { data: sess } = await client.auth.getSession();
          if (sess.session) {
            window.clearInterval(timer);
            try {
              popup.close();
            } catch {
              /* noop */
            }
            resolve(null); // onAuthStateChange already updated app state
            return;
          }
          if (closed) {
            window.clearInterval(timer);
            analytics.track("oauth_failed", { provider, reason: "cancelled" });
            resolve(OAUTH_CANCELLED);
            return;
          }
          if (Date.now() - startedAt > 3 * 60_000) {
            window.clearInterval(timer);
            try {
              popup.close();
            } catch {
              /* noop */
            }
            resolve("Sign-in timed out. Please try again.");
          }
        }, 500);
      });
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return ACCOUNT_SERVICE_UNAVAILABLE;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl("/auth/reset-password"),
    });
    if (error) return humanAuthError(error);
    return null;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) return ACCOUNT_SERVICE_UNAVAILABLE;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return humanAuthError(error);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      auth,
      loading: auth.status === "loading",
      session,
      signInWithPassword,
      signUpWithPassword,
      signInWithOAuth,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      auth,
      session,
      signInWithPassword,
      signUpWithPassword,
      signInWithOAuth,
      requestPasswordReset,
      updatePassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
