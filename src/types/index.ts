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

interface VisualMediaBase {
  id: string;
  file: File;
  name: string;
  size: number;
  /** Object URL for thumbnail / preview. */
  previewUrl: string;
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
  | "normalizing-videos"
  | "building-sequence"
  | "combining"
  | "finalizing";

export const RENDER_STAGE_LABELS: Record<RenderStage, string> = {
  idle: "Idle",
  "loading-engine": "Loading rendering engine",
  "reading-metadata": "Reading media metadata",
  "preparing-soundtrack": "Preparing soundtrack",
  "preparing-images": "Preparing images",
  "normalizing-videos": "Normalizing video clips",
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
