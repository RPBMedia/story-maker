import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("reports authConfigured false and lists both missing vars when unset", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const cfg = loadConfig();
    expect(cfg.authConfigured).toBe(false);
    expect(cfg.missingEnvVars).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
    ]);
  });

  it("reports only the specific variable that is missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const cfg = loadConfig();
    expect(cfg.authConfigured).toBe(false);
    expect(cfg.missingEnvVars).toEqual(["VITE_SUPABASE_ANON_KEY"]);
  });

  it("is configured (no missing vars) once both are present and the URL is valid", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key-value");
    const cfg = loadConfig();
    expect(cfg.authConfigured).toBe(true);
    expect(cfg.missingEnvVars).toEqual([]);
  });

  it("rejects a malformed URL without crashing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "not-a-url");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key-value");
    expect(() => loadConfig()).not.toThrow();
    const cfg = loadConfig();
    expect(cfg.authConfigured).toBe(false);
  });
});
