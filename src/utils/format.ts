/** Human-friendly formatting helpers. */

import type { MediaDateSource } from "../types";

/** Honest label for each date source — never claims lastModified is capture. */
const DATE_SOURCE_LABELS: Record<MediaDateSource, string> = {
  "embedded-original": "Captured",
  "embedded-created": "Created",
  "file-last-modified": "Modified",
  "upload-time": "Added",
};

/** Fuller explanation shown on hover, so the short label can't mislead. */
const DATE_SOURCE_HINTS: Record<MediaDateSource, string> = {
  "embedded-original": "EXIF capture date embedded by the camera",
  "embedded-created": "Creation timestamp embedded in the file",
  "file-last-modified": "File last-modified time (not necessarily the capture date)",
  "upload-time": "Time this item was added to the project",
};

export interface FormattedMediaDate {
  /** e.g. "Captured", "Created", "Modified", "Added". */
  label: string;
  /** e.g. "14 July 2024"; "Today"/"Yesterday" for very recent upload times. */
  value: string;
  sourceHint: string;
}

/**
 * Format a media item's creation date for display. Upload-time dates within the
 * last two days read as "Today"/"Yesterday" (matching the spec's "Added Today"
 * example); everything else uses an unambiguous "14 July 2024" form.
 */
export function formatMediaDate(
  timestamp: number,
  source: MediaDateSource,
  now: number = Date.now(),
): FormattedMediaDate {
  const label = DATE_SOURCE_LABELS[source];
  const sourceHint = DATE_SOURCE_HINTS[source];
  if (!Number.isFinite(timestamp)) {
    return { label, value: "Unknown", sourceHint };
  }

  const startOfDay = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(timestamp)) / 86400000,
  );
  if (source === "upload-time" && dayDiff === 0) {
    return { label, value: "Today", sourceHint };
  }
  if (source === "upload-time" && dayDiff === 1) {
    return { label, value: "Yesterday", sourceHint };
  }

  const value = new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return { label, value, sourceHint };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "–";
  return `${seconds.toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = u;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}
