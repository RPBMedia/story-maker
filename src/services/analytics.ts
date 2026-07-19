/** Analytics abstraction — a no-op console logger until a vendor is chosen.
 *
 * Rules: no file names, no email addresses, no uploaded-media metadata in
 * event payloads. Counts and categories only.
 */

export type AnalyticsEvent =
  | "account_gate_viewed"
  | "sign_up_started"
  | "sign_up_completed"
  | "sign_in_completed"
  | "export_attempted"
  | "export_started"
  | "export_completed"
  | "export_failed"
  | "render_time_estimate_viewed"
  | "render_cancelled"
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
