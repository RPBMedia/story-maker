/** Plan definitions — the single source of truth for what each tier allows.
 *
 * These are enforced client-side for product validation. A determined user can
 * bypass client gating; real billing/quota enforcement will require a trusted
 * backend (see exportPolicy.ts's honest security note). Prices are display
 * values — no payment processing is wired yet.
 */
import type { PlanEntitlements, PlanId } from "../types";
import { DEFAULT_RENDER_SETTINGS } from "../types";

/** Tiers from cheapest to most capable — used for upgrade prompts and the
 * plan comparison UI. */
export const PLAN_ORDER: PlanId[] = ["free", "creator", "professional"];

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    plan: "free",
    label: "Free",
    priceMonthly: 0,
    maxProjectDurationSeconds: 120, // 2 minutes
    maxAudioTracks: 1,
    maxResolution: { width: 1280, height: 720 },
    maxFps: 30,
    watermark: true,
    effects: true, // basic effects allowed
    titleCardZoom: false, // card zoom is a paid polish
    exportQuotaPerMonth: 5,
    serverRendering: false,
    storageBytes: null,
  },
  creator: {
    plan: "creator",
    label: "Creator",
    priceMonthly: 5,
    maxProjectDurationSeconds: 600, // 10 minutes
    maxAudioTracks: null, // multiple
    maxResolution: { width: 1920, height: 1080 },
    maxFps: 30,
    watermark: false,
    effects: true,
    titleCardZoom: true,
    exportQuotaPerMonth: 50,
    serverRendering: true,
    storageBytes: null,
  },
  professional: {
    plan: "professional",
    label: "Pro",
    priceMonthly: 15,
    maxProjectDurationSeconds: null, // unlimited
    maxAudioTracks: null,
    maxResolution: { width: 1920, height: 1080 },
    maxFps: 60,
    watermark: false,
    effects: true,
    titleCardZoom: true,
    exportQuotaPerMonth: null, // unlimited
    serverRendering: true, // priority
    storageBytes: null,
  },
};

export function entitlementsFor(plan: PlanId | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan ?? "free"] ?? PLAN_ENTITLEMENTS.free;
}

/**
 * "God mode" account: this email may switch between plans freely (no payment)
 * to test every tier. The override is applied client-side in PlanContext.
 */
export const GOD_MODE_EMAIL = "rui.palma.baiao@gmail.com";

export function isGodModeEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === GOD_MODE_EMAIL;
}

// A sensible default output profile still resolves even if a plan somehow
// references a resolution the renderer doesn't offer a picker for yet.
export const DEFAULT_OUTPUT = DEFAULT_RENDER_SETTINGS;
