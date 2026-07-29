import { describe, expect, it } from "vitest";
import { evaluateExportPermission } from "./exportPolicy";
import { entitlementsFor } from "./entitlements";
import type { AuthState } from "../types";

function auth(status: AuthState["status"]): AuthState {
  return { status, userId: null, email: null, profile: null };
}

const FREE = entitlementsFor("free");
const CREATOR = entitlementsFor("creator");
const PRO = entitlementsFor("professional");

const signedIn: AuthState = {
  status: "signed-in",
  userId: "u1",
  email: "a@b.c",
  profile: null,
};

describe("evaluateExportPermission — purity / no side effects", () => {
  it("is a pure function: same input → same output, no mutation of auth", () => {
    const signedOut = auth("signed-out");
    const frozen = Object.freeze({ ...signedOut });
    const a = evaluateExportPermission(frozen, FREE, 60);
    const b = evaluateExportPermission(frozen, FREE, 60);
    expect(a).toEqual(b);
    expect(frozen.status).toBe("signed-out");
  });

  it("never authenticates as a side effect", () => {
    const signedOut = auth("signed-out");
    for (let i = 0; i < 5; i++) {
      expect(evaluateExportPermission(signedOut).status).toBe(
        "authentication-required",
      );
    }
  });
});

describe("evaluateExportPermission — auth states", () => {
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

  it("reports unavailable (calm message) when auth is unconfigured", () => {
    const p = evaluateExportPermission(auth("unconfigured"));
    expect(p.status).toBe("unavailable");
    if (p.status === "unavailable") {
      expect(p.message).not.toMatch(/VITE_SUPABASE|not configured|environment/i);
      expect(p.message.length).toBeGreaterThan(0);
    }
  });

  it("allows a short project when signed in", () => {
    expect(evaluateExportPermission(signedIn, FREE, 60).status).toBe("allowed");
  });
});

describe("evaluateExportPermission — duration paywall by plan", () => {
  it("blocks a Free export beyond 120s with payment-required/duration-limit", () => {
    const p = evaluateExportPermission(signedIn, FREE, 200);
    expect(p.status).toBe("payment-required");
    if (p.status === "payment-required") {
      expect(p.reason).toBe("duration-limit");
      expect(p.thresholdSeconds).toBe(120);
      expect(p.projectDurationSeconds).toBe(200);
    }
  });

  it("allows a Free export at exactly the 120s limit (with rounding slack)", () => {
    expect(evaluateExportPermission(signedIn, FREE, 120).status).toBe("allowed");
    expect(evaluateExportPermission(signedIn, FREE, 120.4).status).toBe("allowed");
  });

  it("Creator extends the limit to 10 minutes", () => {
    expect(evaluateExportPermission(signedIn, CREATOR, 200).status).toBe("allowed");
    expect(evaluateExportPermission(signedIn, CREATOR, 601).status).toBe(
      "payment-required",
    );
  });

  it("Pro has no duration limit", () => {
    expect(evaluateExportPermission(signedIn, PRO, 99999).status).toBe("allowed");
  });

  it("never charges before sign-in — signed-out over the limit is auth-required", () => {
    expect(evaluateExportPermission(auth("signed-out"), FREE, 9999).status).toBe(
      "authentication-required",
    );
  });

  it("defaults to the free plan when no entitlements are passed", () => {
    expect(evaluateExportPermission(signedIn, undefined, 9999).status).toBe(
      "payment-required",
    );
  });
});
