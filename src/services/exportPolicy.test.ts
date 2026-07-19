import { describe, expect, it } from "vitest";
import { evaluateExportPermission } from "./exportPolicy";
import type { AuthState } from "../types";

function auth(status: AuthState["status"]): AuthState {
  return { status, userId: null, email: null, profile: null };
}

describe("evaluateExportPermission", () => {
  it("requires authentication when signed out", () => {
    expect(evaluateExportPermission(auth("signed-out")).kind).toBe(
      "auth-required",
    );
  });

  it("does NOT allow export while the session is still loading", () => {
    expect(evaluateExportPermission(auth("loading")).kind).toBe(
      "auth-required",
    );
  });

  it("allows export when signed in", () => {
    expect(
      evaluateExportPermission({
        status: "signed-in",
        userId: "u1",
        email: "a@b.c",
        profile: null,
      }).kind,
    ).toBe("allowed");
  });

  it("reports unavailable (with reason) when auth is unconfigured", () => {
    const p = evaluateExportPermission(auth("unconfigured"));
    expect(p.kind).toBe("temporarily-unavailable");
    if (p.kind === "temporarily-unavailable") {
      expect(p.reason).toMatch(/Supabase/i);
    }
  });
});
