/** Pure ffmpeg filter-graph builders — no ffmpeg, no React, fully testable.
 *
 * Kept separate from RenderingService so transition/zoom math can be unit
 * tested without loading wasm.
 */
import type {
  EffectiveTimeline,
  RenderSettings,
  ZoomEffectSettings,
} from "../../types";
import { xfadeOffsets } from "../../utils/timeline";

/** Normalization chain shared by every segment (identical params so the
 * no-transition path can stream-copy concat). */
export function scalePadChain(s: RenderSettings): string {
  return (
    `scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,` +
    `pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2:black,` +
    `setsar=1,fps=${s.fps},format=yuv420p`
  );
}

/**
 * Subtle Ken Burns zoom as a time-based crop on the composed frame.
 *
 * zoom-in : z(t) = 1 + (A−1)·t/D   (starts framed, ends magnified by A)
 * zoom-out: z(t) = A − (A−1)·t/D   (starts magnified by A, ends framed)
 *
 * Cropping the already letterboxed frame guarantees no blank borders appear;
 * the trade-off (modest edge cropping while zoomed) is communicated in the
 * UI. Returns null when no zoom applies.
 */
export function zoomChain(
  zoom: ZoomEffectSettings,
  durationSeconds: number,
  s: RenderSettings,
): string | null {
  if (zoom.type === "none" || durationSeconds <= 0) return null;
  const A = zoom.amount.toFixed(4);
  const D = Math.max(durationSeconds, 0.001).toFixed(3);
  const z =
    zoom.type === "zoom-in"
      ? `(1+(${A}-1)*min(t/${D}\\,1))`
      : `(${A}-(${A}-1)*min(t/${D}\\,1))`;
  return (
    `crop=w='iw/${z}':h='ih/${z}':x='(iw-ow)/2':y='(ih-oh)/2',` +
    `scale=${s.width}:${s.height},setsar=1`
  );
}

export interface XfadeGraph {
  /** Full -filter_complex value. */
  filter: string;
  /** Name of the final output pad (without brackets). */
  outLabel: string;
}

/**
 * Chain the normalized segments with xfade (cross-fade boundaries) and the
 * concat filter (hard-cut boundaries). Inputs are expected in timeline order
 * as [0:v], [1:v], ...
 */
export function buildXfadeGraph(timeline: EffectiveTimeline): XfadeGraph {
  const n = timeline.segments.length;
  if (n < 2) {
    return { filter: "[0:v]null[vout]", outLabel: "vout" };
  }
  const offsets = xfadeOffsets(timeline);
  const parts: string[] = [];
  let prev = "0:v";
  for (let i = 0; i < n - 1; i++) {
    const next = `${i + 1}:v`;
    const out = i === n - 2 ? "vout" : `vx${i + 1}`;
    const boundary = timeline.boundaries.find((b) => b.afterIndex === i);
    if (boundary && boundary.type === "crossfade" && boundary.overlap > 0) {
      parts.push(
        `[${prev}][${next}]xfade=transition=fade:duration=${boundary.overlap.toFixed(
          3,
        )}:offset=${offsets[i].toFixed(3)}[${out}]`,
      );
    } else {
      parts.push(`[${prev}][${next}]concat=n=2:v=1:a=0[${out}]`);
    }
    prev = out;
  }
  return { filter: parts.join(";"), outLabel: "vout" };
}

/** True when the timeline needs the (slower) filter-graph path at all. */
export function needsXfadePath(timeline: EffectiveTimeline): boolean {
  return timeline.boundaries.some(
    (b) => b.type === "crossfade" && b.overlap > 0,
  );
}
