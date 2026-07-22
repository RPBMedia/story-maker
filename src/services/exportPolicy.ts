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
import type { AuthState, ExportPermission } from "../types";

/**
 * Future paywall threshold: videos up to and including this length will stay
 * on the free export path; longer videos will eventually require payment or
 * a paid plan. NOT enforced yet — see ENFORCE_DURATION_LIMIT below. Exported
 * so the UI can reference the same number once the rule goes live.
 */
export const FREE_EXPORT_DURATION_LIMIT_SECONDS = 600;

/**
 * Enforcement switch for the future duration-based paywall. Flip this only
 * once real payment/subscription handling exists — until then
 * evaluateExportPermission must never return "payment-required", regardless
 * of project length.
 */
const ENFORCE_DURATION_LIMIT = false;

export function evaluateExportPermission(
  auth: AuthState,
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

  // Future duration-based paywall (inert until ENFORCE_DURATION_LIMIT flips).
  if (
    ENFORCE_DURATION_LIMIT &&
    projectDurationSeconds !== undefined &&
    projectDurationSeconds > FREE_EXPORT_DURATION_LIMIT_SECONDS
  ) {
    return {
      status: "payment-required",
      reason: "duration-limit",
      thresholdSeconds: FREE_EXPORT_DURATION_LIMIT_SECONDS,
      projectDurationSeconds,
    };
  }

  return { status: "allowed" };
}
