import { describe, expect, it } from "vitest";
import {
  PLAN_ENTITLEMENTS,
  PLAN_ORDER,
  entitlementsFor,
  isGodModeEmail,
  GOD_MODE_EMAIL,
} from "./entitlements";

describe("plan entitlements", () => {
  it("orders tiers cheapest → most capable", () => {
    expect(PLAN_ORDER).toEqual(["free", "creator", "professional"]);
  });

  it("free: 120s, 1 audio track, watermark, $0", () => {
    const f = PLAN_ENTITLEMENTS.free;
    expect(f.priceMonthly).toBe(0);
    expect(f.maxProjectDurationSeconds).toBe(120);
    expect(f.maxAudioTracks).toBe(1);
    expect(f.watermark).toBe(true);
    expect(f.serverRendering).toBe(false);
  });

  it("creator: $5, 10 min, multiple audio, no watermark, server render", () => {
    const c = PLAN_ENTITLEMENTS.creator;
    expect(c.priceMonthly).toBe(5);
    expect(c.maxProjectDurationSeconds).toBe(600);
    expect(c.maxAudioTracks).toBeNull();
    expect(c.watermark).toBe(false);
    expect(c.serverRendering).toBe(true);
  });

  it("pro: $15, unlimited length + quota, 60fps", () => {
    const p = PLAN_ENTITLEMENTS.professional;
    expect(p.priceMonthly).toBe(15);
    expect(p.maxProjectDurationSeconds).toBeNull();
    expect(p.maxAudioTracks).toBeNull();
    expect(p.exportQuotaPerMonth).toBeNull();
    expect(p.maxFps).toBe(60);
    expect(p.watermark).toBe(false);
  });

  it("entitlementsFor falls back to free for unknown/empty", () => {
    expect(entitlementsFor(null).plan).toBe("free");
    expect(entitlementsFor(undefined).plan).toBe("free");
    expect(entitlementsFor("creator").plan).toBe("creator");
  });

  it("recognizes the god-mode email case-insensitively", () => {
    expect(isGodModeEmail(GOD_MODE_EMAIL)).toBe(true);
    expect(isGodModeEmail(GOD_MODE_EMAIL.toUpperCase())).toBe(true);
    expect(isGodModeEmail("  " + GOD_MODE_EMAIL + "  ")).toBe(true);
    expect(isGodModeEmail("someone@else.com")).toBe(false);
    expect(isGodModeEmail(null)).toBe(false);
  });
});
