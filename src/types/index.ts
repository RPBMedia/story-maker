/** Core domain models for StoryMaker. */

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  /** Seconds, from metadata probe. */
  duration: number;
  size: number;
  /** Object URL for inline preview playback. */
  previewUrl: string;
}

/**
 * Where a media item's resolved creation date came from, in descending order
 * of trust. Never claim `file-last-modified` is the capture date in the UI —
 * the label copy in the editor maps each source to honest wording.
 */
export type MediaDateSource =
  | "embedded-original"
  | "embedded-created"
  | "file-last-modified"
  | "upload-time";

interface VisualMediaBase {
  id: string;
  file: File;
  name: string;
  size: number;
  /** Object URL for thumbnail / preview. */
  previewUrl: string;
  /** Resolved creation timestamp (ms since epoch). Always populated at upload
   * — never rejects media when metadata is missing (falls back to upload
   * time). Sorting reads this directly; it is not re-parsed after upload. */
  createdAt: number;
  /** Which metadata source produced {@link createdAt}. */
  dateSource: MediaDateSource;
}

export interface ImageMediaItem extends VisualMediaBase {
  kind: "image";
  width: number;
  height: number;
}

export interface VideoMediaItem extends VisualMediaBase {
  kind: "video";
  /** Source duration in seconds. */
  duration: number;
  width: number;
  height: number;
}

export type VisualMediaItem = ImageMediaItem | VideoMediaItem;

/**
 * How the current visual sequence was ordered. `manual` means the user placed
 * items by hand (drag or move buttons) — automatic sorting no longer applies.
 * The automatic modes are recomputed only when explicitly requested; the
 * resulting order is then frozen in project state and used verbatim by the
 * renderer (rendering never re-sorts or re-shuffles).
 */
export type OrderingMode =
  | "manual"
  | "date-asc"
  | "date-desc"
  | "name-asc"
  | "name-desc"
  | "shuffled";

/** The subset of {@link OrderingMode} selectable from the Sort dropdown. */
export type SortOrderingMode = Exclude<OrderingMode, "shuffled">;

export interface MediaMetadata {
  duration?: number;
  width?: number;
  height?: number;
}

export interface RenderSettings {
  width: number;
  height: number;
  fps: number;
  /** Container/codec target. MVP supports mp4/h264/aac only. */
  format: "mp4";
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  width: 1280,
  height: 720,
  fps: 30,
  format: "mp4",
};

export type RenderStage =
  | "idle"
  | "loading-engine"
  | "reading-metadata"
  | "preparing-soundtrack"
  | "preparing-images"
  | "applying-zoom"
  | "normalizing-videos"
  | "building-transitions"
  | "building-sequence"
  | "combining"
  | "finalizing";

export const RENDER_STAGE_LABELS: Record<RenderStage, string> = {
  idle: "Idle",
  "loading-engine": "Loading rendering engine",
  "reading-metadata": "Reading media metadata",
  "preparing-soundtrack": "Preparing soundtrack",
  "preparing-images": "Preparing images",
  "applying-zoom": "Applying zoom effects",
  "normalizing-videos": "Normalizing video clips",
  "building-transitions": "Building transitions",
  "building-sequence": "Building visual sequence",
  combining: "Combining audio and video",
  finalizing: "Finalizing output",
};

export type RenderStatus =
  | "idle"
  | "rendering"
  | "done"
  | "cancelled"
  | "error";

export interface RenderProgress {
  stage: RenderStage;
  /** 0..1 across the whole render. */
  overall: number;
}

export interface RenderResult {
  url: string;
  blob: Blob;
  size: number;
  /** Target duration in seconds (soundtrack duration). */
  duration: number;
}

export interface RenderError {
  message: string;
  /** Short technical detail for a collapsible section, never the headline. */
  detail?: string;
  /** True when the uploaded project is still intact and retry is sensible. */
  projectIntact: boolean;
}

/** A visual item with its allocated slot in the output timeline. */
export interface AllocatedSegment {
  item: VisualMediaItem;
  /** Seconds this item occupies in the final video. */
  duration: number;
  /** For videos: trim the source to this many seconds (<= source duration). */
  trimTo?: number;
}

export interface DurationPlan {
  segments: AllocatedSegment[];
  /** Seconds of freeze-frame appended to the last segment (0 when none). */
  freezeTail: number;
  /** Total visual duration; always equals soundtrack duration when valid. */
  total: number;
  /** True when videos alone exceeded the soundtrack and were trimmed. */
  trimmed: boolean;
}

// ---- visual effects ---------------------------------------------------------

export type TransitionType = "none" | "crossfade";

export interface TransitionSettings {
  type: TransitionType;
  /** Seconds; only meaningful for type !== "none". */
  duration: number;
}

export const TRANSITION_LIMITS = {
  min: 0.2,
  max: 3,
  step: 0.05,
  default: 0.75,
  /** A boundary's crossfade may consume at most this fraction of the shorter
   * neighboring segment. */
  maxNeighborFraction: 0.45,
} as const;

export const DEFAULT_TRANSITION: TransitionSettings = {
  type: "none",
  duration: TRANSITION_LIMITS.default,
};

export type ZoomEffectType = "none" | "zoom-in" | "zoom-out";

export interface ZoomEffectSettings {
  type: ZoomEffectType;
  /** Final (or initial, for zoom-out) scale factor, e.g. 1.04. */
  amount: number;
}

export const ZOOM_LIMITS = {
  min: 1.01,
  max: 1.1,
  step: 0.01,
  default: 1.04,
} as const;

export const DEFAULT_ZOOM: ZoomEffectSettings = {
  type: "none",
  amount: ZOOM_LIMITS.default,
};

/** Per-item overrides; null/undefined = use the project default. */
export interface VisualEffectOverrides {
  transition?: TransitionSettings | null;
  zoom?: ZoomEffectSettings | null;
}

// ---- title / end cards ------------------------------------------------------

/** An auto-generated intro (title) or outro (end) card. It renders as a
 * fixed-duration segment *inside* the soundtrack, so the output length always
 * equals the music; the media clips share whatever time the cards don't use. */
export interface CardSettings {
  enabled: boolean;
  text: string;
  /** How long the card holds, in seconds (see {@link CARD_LIMITS}). */
  durationSeconds: number;
  /** Fade the card in (title) / out (end) from black. Available on every plan. */
  fade: boolean;
  /** Slow push in/out on the card. Reuses the standard zoom effect and is a
   * PAID capability (coerced to "none" for Free plans). */
  zoom: ZoomEffectType;
}

export const CARD_LIMITS = {
  minSeconds: 2,
  maxSeconds: 10,
  step: 0.5,
  default: 3,
} as const;

export const DEFAULT_TITLE_CARD: CardSettings = {
  enabled: false,
  text: "",
  durationSeconds: CARD_LIMITS.default,
  fade: true,
  zoom: "none",
};

export const DEFAULT_END_CARD: CardSettings = {
  enabled: false,
  text: "",
  durationSeconds: CARD_LIMITS.default,
  fade: true,
  zoom: "none",
};

// ---- effect-aware timeline --------------------------------------------------

/** One boundary between segment i and i+1 (the transition AFTER item i). */
export interface TransitionBoundary {
  afterIndex: number;
  type: TransitionType;
  /** Requested duration before clamping. */
  requested: number;
  /** Actual overlap used (0 when type === "none"). */
  overlap: number;
  clamped: boolean;
}

export interface TimelineSegment {
  item: VisualMediaItem;
  /** Raw segment duration on its own clock. */
  duration: number;
  /** For videos: trim source to this many seconds. */
  trimTo?: number;
  /** Effective placement on the shared output clock. */
  start: number;
  end: number;
  /** Resolved zoom effect for this item. */
  zoom: ZoomEffectSettings;
  /** Present when this segment is an auto-generated title/end card; drives the
   * fade-from-black render step. Absent for normal media segments. */
  card?: { role: "title" | "end"; fade: boolean };
}

export interface EffectiveTimeline {
  segments: TimelineSegment[];
  boundaries: TransitionBoundary[];
  /** Sum of active overlaps. */
  totalOverlap: number;
  /** Final output duration; equals soundtrack duration when valid. */
  total: number;
  freezeTail: number;
  trimmed: boolean;
  /** True when any requested transition duration had to be clamped. */
  anyClamped: boolean;
  /** Seconds of fade-to-black applied to the LAST segment's tail so the video
   * ends on black. Non-zero only when the cross-fade option is enabled. */
  endFade: number;
}

// ---- render-time estimation ---------------------------------------------------

export type RenderTimeCategory = "short" | "medium" | "long";

export interface RenderTimeEstimate {
  category: RenderTimeCategory;
  /** Human copy, e.g. "around 5 minutes". */
  label: string;
  /** Factors that pushed the estimate up (for UI explanation). */
  factors: string[];
}

export interface RenderTimingState {
  startedAt: number | null;
  elapsedMs: number;
  /** Milliseconds; null until enough real progress exists to infer one. */
  estimatedRemainingMs: number | null;
}

// ---- auth / accounts ----------------------------------------------------------

export type PlanId = "free" | "creator" | "professional";

/** What each plan is allowed to do. Values live in services/entitlements.ts. */
export interface PlanEntitlements {
  plan: PlanId;
  /** Display name, e.g. "Free", "Creator", "Pro". */
  label: string;
  /** Price per month in USD (0 for free). */
  priceMonthly: number;
  /** Max exported video length in seconds; null = unlimited. */
  maxProjectDurationSeconds: number | null;
  /** Max number of soundtrack audio tracks; null = unlimited. */
  maxAudioTracks: number | null;
  maxResolution: { width: number; height: number };
  /** Max frame rate. */
  maxFps: number;
  /** True when exports carry a StoryMaker watermark. */
  watermark: boolean;
  /** Cross-fades / zoom effects available. */
  effects: boolean;
  /** Zoom (push in/out) on title & end cards — a paid-only card polish. Free
   * plans can still add cards and fade them, just without zoom. */
  titleCardZoom: boolean;
  /** Exports allowed per month; null = unlimited. */
  exportQuotaPerMonth: number | null;
  /** Fast/priority server-side rendering (vs in-browser). */
  serverRendering: boolean;
  storageBytes: number | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  plan: PlanId;
  exportCount: number;
}

export type AuthStatus =
  | "loading"
  | "signed-out"
  | "signed-in"
  | "unconfigured";

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
}

/**
 * Central export authorization result (extensible for monetization).
 *
 * `payment-required` with `reason: "duration-limit"` is returned when a
 * project exceeds the current plan's `maxProjectDurationSeconds` (see
 * exportPolicy.ts + services/entitlements.ts). The UI renders an upgrade
 * prompt for it.
 */
export type ExportPermission =
  | { status: "allowed" }
  | { status: "authentication-required" }
  | {
      status: "payment-required";
      reason: "duration-limit";
      thresholdSeconds: number;
      projectDurationSeconds: number;
    }
  | { status: "quota-exceeded" }
  | { status: "unavailable"; message: string };
