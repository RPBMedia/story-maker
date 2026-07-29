/** Central export authorization — the ONE place that decides whether an
 * export may start. UI components ask this policy; monetization rules land
 * here later (quota, plan, duration limits, server capacity), never inside
 * the Generate Video button or any other component.
 *
 * Honest security note (also in the README): this is client-side gating for
 * product validation. A determined user can bypass it; real quota/plan
 * enforcement will require a trusted backend (server-side rendering or
 * signed export jobs).
 */
import type { AuthState, ExportPermission, PlanEntitlements } from "../types";
import { entitlementsFor } from "./entitlements";

export function evaluateExportPermission(
  auth: AuthState,
  entitlements: PlanEntitlements = entitlementsFor("free"),
  projectDurationSeconds?: number,
): ExportPermission {
  // While the session is still resolving, exporting must NOT be allowed —
  // a loading state is not a signed-in state. The UI shows this as a brief
  // "checking your account" moment, not as a request to sign in again.
  if (auth.status === "loading") {
    return { status: "authentication-required" };
  }
  if (auth.status === "unconfigured") {
    // Auth backend missing entirely (e.g. local dev without .env). This is a
    // service-availability problem, not a "you must sign in" problem — kept
    // as a distinct status so the UI can show calm, non-technical copy
    // instead of an authentication prompt that can't actually work.
    return {
      status: "unavailable",
      message:
        "Account services are temporarily unavailable. Your project is safe — you can keep working, and exporting will be available again shortly.",
    };
  }
  if (auth.status === "signed-out") {
    return { status: "authentication-required" };
  }

  // Signed in from here on. Future quota checks land here, e.g.
  //   if (quotaExceeded(auth.profile)) return { status: "quota-exceeded" };

  // Duration paywall: the current plan's max length. null = unlimited (Pro).
  const limit = entitlements.maxProjectDurationSeconds;
  if (
    limit !== null &&
    projectDurationSeconds !== undefined &&
    projectDurationSeconds > limit + DURATION_TOLERANCE_SECONDS
  ) {
    return {
      status: "payment-required",
      reason: "duration-limit",
      thresholdSeconds: limit,
      projectDurationSeconds,
    };
  }

  return { status: "allowed" };
}

/** Small slack so a project that rounds to exactly the limit isn't blocked. */
const DURATION_TOLERANCE_SECONDS = 0.5;
