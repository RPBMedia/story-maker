/** Supabase client singleton. Null when the environment is not configured —
 * the app must keep working (editor fully usable) without it. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/env";

export const supabase: SupabaseClient | null = config.authConfigured
  ? createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        // Supabase's built-in persistence + refresh; no custom token storage.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Map raw Supabase/auth errors onto calm, human copy. */
export function humanAuthError(raw: unknown): string {
  const msg =
    raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password combination doesn't match. Check both and try again.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password") && (m.includes("at least") || m.includes("weak"))) {
    return "That password is too weak — use at least 8 characters.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the confirmation link.";
  }
  if (m.includes("expired") || m.includes("invalid token") || m.includes("otp")) {
    return "That link has expired or was already used. Request a new one and try again.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts — please wait a minute and try again.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  }
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "This sign-in method isn't configured yet on the server.";
  }
  return msg || "Something went wrong. Please try again.";
}
