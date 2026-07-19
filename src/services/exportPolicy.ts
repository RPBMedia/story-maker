/** Central export authorization — the ONE place that decides whether an
 * export may start. UI components ask this policy; monetization rules land
 * here later (quota, plan, server capacity), never inside render buttons.
 *
 * Honest security note (also in the README): this is client-side gating for
 * product validation. A determined user can bypass it; real quota/plan
 * enforcement will require a trusted backend (server-side rendering or
 * signed export jobs).
 */
import type { AuthState, ExportPermission } from "../types";

export function evaluateExportPermission(auth: AuthState): ExportPermission {
  // While the session is still resolving, exporting must NOT be allowed —
  // a loading state is not a signed-in state.
  if (auth.status === "loading") {
    return { kind: "auth-required" };
  }
  if (auth.status === "unconfigured") {
    // Auth backend missing entirely (e.g. local dev without .env). Exporting
    // would be gated by nothing, so surface it as unavailable-with-reason.
    return {
      kind: "temporarily-unavailable",
      reason:
        "Account features are not configured in this environment. Add the Supabase environment variables to enable export.",
    };
  }
  if (auth.status === "signed-out") {
    return { kind: "auth-required" };
  }
  // Future: quota / subscription / maintenance checks land here, e.g.
  //   if (quotaExceeded(auth.profile)) return { kind: "quota-exceeded", ... }
  return { kind: "allowed" };
}
