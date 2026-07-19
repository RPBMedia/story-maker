/** Rough, honest render-time estimation for UI copy — never a promise.
 *
 * Pure and unit-tested; kept away from React. Returns a category and label,
 * deliberately not minute-precise numbers. Device speed dominates real-world
 * results, so every consumer must pair this with the device disclaimer.
 */
import type { EffectiveTimeline, RenderTimeEstimate } from "../types";

export interface EstimateInput {
  soundtrackDuration: number;
  itemCount: number;
  videoSourceSeconds: number;
  outputPixels: number; // width * height
  transitionCount: number;
  zoomedItemCount: number;
}

export function estimateInputFromTimeline(
  soundtrackDuration: number,
  timeline: EffectiveTimeline,
  outputPixels: number,
): EstimateInput {
  return {
    soundtrackDuration,
    itemCount: timeline.segments.length,
    videoSourceSeconds: timeline.segments
      .filter((s) => s.item.kind === "video")
      .reduce((sum, s) => sum + s.duration, 0),
    outputPixels,
    transitionCount: timeline.boundaries.filter(
      (b) => b.type !== "none" && b.overlap > 0,
    ).length,
    zoomedItemCount: timeline.segments.filter((s) => s.zoom.type !== "none")
      .length,
  };
}

export function estimateRenderTime(input: EstimateInput): RenderTimeEstimate {
  const factors: string[] = [];

  // Base score ≈ minutes of output at 720p; effects and item count add weight.
  let score = input.soundtrackDuration / 60;

  if (input.soundtrackDuration > 5 * 60) factors.push("long soundtrack");
  if (input.itemCount > 15) {
    score += 1;
    factors.push("many media items");
  }
  if (input.videoSourceSeconds > 120) {
    score += 1;
    factors.push("long video clips");
  }
  if (input.transitionCount > 0) {
    // xfade forces a full re-encode of the visual timeline
    score += 1.5 + input.transitionCount * 0.1;
    factors.push("cross-fade transitions");
  }
  if (input.zoomedItemCount > 0) {
    score += 0.5 + input.zoomedItemCount * 0.1;
    factors.push("zoom effects");
  }
  if (input.outputPixels > 1280 * 720) {
    score *= 1.8;
    factors.push("high output resolution");
  }

  if (score <= 3) {
    return {
      category: "short",
      label: "around 5 minutes",
      factors,
    };
  }
  if (score <= 7) {
    return {
      category: "medium",
      label: "around 5–10 minutes",
      factors,
    };
  }
  return {
    category: "long",
    label: "around 10–15 minutes, possibly more",
    factors,
  };
}

/** Only claim a remaining-time estimate when real progress exists. */
export function estimateRemainingMs(
  elapsedMs: number,
  overallProgress: number,
): number | null {
  if (overallProgress < 0.08 || elapsedMs < 10_000) return null;
  return Math.max(0, (elapsedMs / overallProgress) * (1 - overallProgress));
}

export function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
