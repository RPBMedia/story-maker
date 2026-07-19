import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, humanAuthError } from "../../services/supabase";
import { config, authRedirectUrl } from "../../config/env";
import { analytics } from "../../services/analytics";
import type { AuthState, UserProfile } from "../../types";

export interface AuthApi {
  auth: AuthState;
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
  return {
    status: "signed-in",
    userId: session.user.id,
    email: session.user.email ?? null,
    profile: null, // filled asynchronously
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() =>
    config.authConfigured
      ? { status: "loading", userId: null, email: null, profile: null }
      : { status: "unconfigured", userId: null, email: null, profile: null },
  );

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!disposed) setAuth(stateFromSession(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!disposed) setAuth(stateFromSession(session));
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the profile row after sign-in (best-effort; RLS scopes it to self).
  useEffect(() => {
    if (!supabase || auth.status !== "signed-in" || !auth.userId) return;
    if (auth.profile) return;
    let disposed = false;
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, plan, export_count")
      .eq("id", auth.userId)
      .maybeSingle()
      .then(({ data }) => {
        if (disposed || !data) return;
        const profile: UserProfile = {
          id: data.id,
          email: data.email,
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
          plan: data.plan ?? "free",
          exportCount: data.export_count ?? 0,
        };
        setAuth((cur) =>
          cur.userId === profile.id ? { ...cur, profile } : cur,
        );
      });
    return () => {
      disposed = true;
    };
  }, [auth.status, auth.userId, auth.profile]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return "Authentication is not configured.";
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return humanAuthError(error);
      analytics.track("sign_in_completed", { method: "password" });
      return null;
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return "Authentication is not configured.";
      analytics.track("sign_up_started", { method: "password" });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectUrl("/") },
      });
      if (error) return humanAuthError(error);
      analytics.track("sign_up_completed", { method: "password" });
      // When email confirmation is enabled, no session exists yet.
      if (!data.session) {
        return "CONFIRM_EMAIL";
      }
      return null;
    },
    [],
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "apple") => {
      if (!supabase) return "Authentication is not configured.";
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authRedirectUrl("/") },
      });
      if (error) return humanAuthError(error);
      return null; // browser is about to navigate away
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return "Authentication is not configured.";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl("/auth/reset-password"),
    });
    if (error) return humanAuthError(error);
    return null;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) return "Authentication is not configured.";
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
      signInWithPassword,
      signUpWithPassword,
      signInWithOAuth,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      auth,
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
