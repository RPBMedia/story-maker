import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PlanProvider, usePlan } from "./PlanContext";
import { GOD_MODE_EMAIL } from "../../services/entitlements";
import type { PlanId } from "../../types";

let mockEmail: string | null = null;
let mockPlan: PlanId = "free";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    auth: {
      status: mockEmail ? "signed-in" : "signed-out",
      userId: mockEmail ? "u1" : null,
      email: mockEmail,
      profile: mockEmail
        ? {
            id: "u1",
            email: mockEmail,
            displayName: null,
            avatarUrl: null,
            plan: mockPlan,
            exportCount: 0,
          }
        : null,
    },
  }),
}));

beforeEach(() => {
  mockEmail = null;
  mockPlan = "free";
});

describe("PlanContext — god mode", () => {
  it("the god account can switch the effective plan freely", () => {
    mockEmail = GOD_MODE_EMAIL;
    const { result } = renderHook(() => usePlan(), { wrapper: PlanProvider });
    expect(result.current.isGod).toBe(true);
    expect(result.current.plan).toBe("free"); // starts at the account plan

    act(() => result.current.setOverride("professional"));
    expect(result.current.plan).toBe("professional");
    expect(result.current.entitlements.priceMonthly).toBe(15);
    expect(result.current.entitlements.maxProjectDurationSeconds).toBeNull();

    act(() => result.current.setOverride("creator"));
    expect(result.current.plan).toBe("creator");
    expect(result.current.entitlements.priceMonthly).toBe(5);

    act(() => result.current.setOverride(null));
    expect(result.current.plan).toBe("free"); // back to account plan
  });

  it("a non-god account ignores any override and follows its account plan", () => {
    mockEmail = "someone@else.com";
    mockPlan = "creator";
    const { result } = renderHook(() => usePlan(), { wrapper: PlanProvider });
    expect(result.current.isGod).toBe(false);
    expect(result.current.plan).toBe("creator");

    // Even if setOverride is invoked, a non-god effective plan does not change.
    act(() => result.current.setOverride("professional"));
    expect(result.current.plan).toBe("creator");
    expect(result.current.override).toBeNull();
  });
});
