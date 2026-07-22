/** Analytics abstraction — a no-op console logger until a vendor is chosen.
 *
 * Rules: no file names, no email addresses, no uploaded-media metadata in
 * event payloads. Counts, categories, and provider names only.
 */

export type AnalyticsEvent =
  // Header / entry points
  | "auth_entry_clicked"
  | "sign_in_viewed"
  | "sign_up_viewed"
  // Email/password
  | "sign_in_started"
  | "sign_in_completed"
  | "sign_in_failed"
  | "sign_up_started"
  | "sign_up_completed"
  | "sign_up_failed"
  // OAuth
  | "oauth_started"
  | "oauth_completed"
  | "oauth_failed"
  // Export account gate
  | "export_auth_gate_viewed"
  | "export_auth_gate_completed"
  // Export / rendering
  | "export_attempted"
  | "export_started"
  | "export_completed"
  | "export_failed"
  | "render_time_estimate_viewed"
  | "render_cancelled"
  // Effects
  | "transition_enabled"
  | "zoom_enabled";

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface Analytics {
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
}

class NoopAnalytics implements Analytics {
  track(event: AnalyticsEvent, props?: AnalyticsProps): void {
    if (import.meta.env.DEV) {
      console.debug(`[analytics] ${event}`, props ?? {});
    }
  }
}

export const analytics: Analytics = new NoopAnalytics();
