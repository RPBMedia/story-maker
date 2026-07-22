import { describe, expect, it } from "vitest";
import {
  evaluateExportPermission,
  FREE_EXPORT_DURATION_LIMIT_SECONDS,
} from "./exportPolicy";
import type { AuthState } from "../types";

function auth(status: AuthState["status"]): AuthState {
  return { status, userId: null, email: null, profile: null };
}

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
