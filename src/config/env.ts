/** Central configuration. All environment access happens here.
 *
 * The Supabase anon key is intentionally browser-exposed (that is its design;
 * Row Level Security protects the data). Service-role keys and OAuth provider
 * secrets must NEVER appear in this file, in Vite env vars, or anywhere in
 * the frontend.
 */

export interface AppConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** True when both Supabase values are present and plausible. */
  authConfigured: boolean;
  /** Origin-aware redirect base — never hardcode localhost. */
  siteOrigin: string;
}

function readEnv(name: string): string | null {
  const value = (import.meta.env[name] as string | undefined)?.trim();
  if (!value) return null;
  return value;
}

function validateUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) return null;
    return url;
  } catch {
    console.warn(
      "[StoryMaker] VITE_SUPABASE_URL is not a valid URL — authentication is disabled.",
    );
    return null;
  }
}

export function loadConfig(): AppConfig {
  const supabaseUrl = validateUrl(readEnv("VITE_SUPABASE_URL"));
  const supabaseAnonKey = readEnv("VITE_SUPABASE_ANON_KEY");
  const authConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  if (!authConfigured && import.meta.env.DEV) {
    console.info(
      "[StoryMaker] Supabase is not configured (VITE_SUPABASE_URL / " +
        "VITE_SUPABASE_ANON_KEY missing). The editor works fully; " +
        "account features and export will explain the missing setup.",
    );
  }
  return {
    supabaseUrl,
    supabaseAnonKey,
    authConfigured,
    siteOrigin:
      typeof window !== "undefined" ? window.location.origin : "",
  };
}

export const config = loadConfig();

/** Where OAuth and password-reset emails should send the browser back to. */
export function authRedirectUrl(path = "/auth/callback"): string {
  return `${config.siteOrigin}${path}`;
}
