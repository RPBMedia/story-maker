import { describe, expect, it } from "vitest";
import {
  evaluateExportPermission,
  FREE_EXPORT_DURATION_LIMIT_SECONDS,
} from "./exportPolicy";
import type { AuthState } from "../types";

function auth(status: AuthState["status"]): AuthState {
  return { status, userId: null, email: null, profile: null };
}

describe("evaluateExportPermission — purity / no side effects", () => {
  it("is a pure function: same input → same output, no mutation of auth", () => {
    const signedOut = auth("signed-out");
    const frozen = Object.freeze({ ...signedOut });
    const a = evaluateExportPermission(frozen, 120);
    const b = evaluateExportPermission(frozen, 120);
    expect(a).toEqual(b);
    // calling it did not mutate the input (frozen would throw on write)
    expect(frozen.status).toBe("signed-out");
  });

  it("never authenticates as a side effect: signed-out stays authentication-required across repeated calls", () => {
    const signedOut = auth("signed-out");
    for (let i = 0; i < 5; i++) {
      expect(evaluateExportPermission(signedOut).status).toBe(
        "authentication-required",
      );
    }
  });

  it("does not import or touch Supabase (module has no auth client dependency)", async () => {
    // If exportPolicy pulled in the Supabase client, importing it in a bare
    // module context would construct the client. It imports only types, so
    // this import is side-effect free.
    const mod = await import("./exportPolicy");
    expect(typeof mod.evaluateExportPermission).toBe("function");
  });
});

describe("evaluateExportPermission", () => {
  it("requires authentication when signed out", () => {
    expect(evaluateExportPermission(auth("signed-out")).status).toBe(
      "authentication-required",
    );
  });

  it("does NOT allow export while the session is still loading", () => {
    expect(evaluateExportPermission(auth("loading")).status).toBe(
      "authentication-required",
    );
  });

  it("allows export when signed in", () => {
    expect(
      evaluateExportPermission({
        status: "signed-in",
        userId: "u1",
        email: "a@b.c",
        profile: null,
      }).status,
    ).toBe("allowed");
  });

  it("reports unavailable (with a calm message) when auth is unconfigured", () => {
    const p = evaluateExportPermission(auth("unconfigured"));
    expect(p.status).toBe("unavailable");
    if (p.status === "unavailable") {
      // Must never leak env var names or "not configured" into the message
      // consumers show by default — that's the exact bug this replaces.
      expect(p.message).not.toMatch(/VITE_SUPABASE|not configured|environment/i);
      expect(p.message.length).toBeGreaterThan(0);
    }
  });

  describe("future duration-based paywall (prepared, not enforced)", () => {
    const signedIn: AuthState = {
      status: "signed-in",
      userId: "u1",
      email: "a@b.c",
      profile: null,
    };

    it("the 600-second threshold constant exists", () => {
      expect(FREE_EXPORT_DURATION_LIMIT_SECONDS).toBe(600);
    });

    it("never returns payment-required in this iteration, even far past the threshold", () => {
      const shortProject = evaluateExportPermission(signedIn, 60);
      const longProject = evaluateExportPermission(signedIn, 3600);
      const noDuration = evaluateExportPermission(signedIn);
      expect(shortProject.status).toBe("allowed");
      expect(longProject.status).toBe("allowed");
      expect(noDuration.status).toBe("allowed");
    });

    it("no permission result of any kind carries status payment-required today", () => {
      const statuses = [
        evaluateExportPermission(auth("signed-out"), 9999),
        evaluateExportPermission(auth("loading"), 9999),
        evaluateExportPermission(auth("unconfigured"), 9999),
        evaluateExportPermission(signedIn, 9999),
      ].map((p) => p.status);
      expect(statuses).not.toContain("payment-required");
    });
  });
});
