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
import { ZOOM_LIMITS } from "../../types";
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
 * Subtle Ken Burns zoom, animated with FFmpeg's `zoompan` filter.
 *
 * Why zoompan and not a time-varying `crop`: `crop`'s width/height are
 * evaluated ONCE at filter init (there is no per-frame `eval` for the crop
 * SIZE), so a `crop=w=iw/z(t)...` expression produces a constant crop — the
 * zoom never animates. That was the original bug: zoom was baked into every
 * segment but never actually moved (most visible with cross-fade on, since
 * that path re-encodes and users expect motion). `zoompan` re-evaluates its
 * expressions per output frame, so it genuinely animates.
 *
 * Contract that keeps segment duration EXACT (the classic zoompan trap is
 * `d` multiplying frames and exploding duration):
 *   - `d=1`  → exactly one output frame per input frame. For a
 *     framerate-driven image input (`-loop 1 -framerate F -t D`) that is
 *     D·F frames = D seconds; for a video clip it is 1:1, preserving motion.
 *   - progress is driven by `on` (cumulative output-frame index), not `d`.
 *   - `s`/`fps` pin the output geometry and rate.
 *
 * zoom-in : z(on) = 1 + (A−1)·on/N , clamped to A   (framed → magnified)
 * zoom-out: z(on) = A − (A−1)·on/N , clamped to 1   (magnified → framed)
 *
 * Smoothness (why the supersample scale up front): `zoompan` rounds its
 * per-frame crop origin `x`/`y` to WHOLE INPUT PIXELS. Our zoom is subtle, so
 * the ideal centre moves only a fraction of a pixel per frame (e.g. ~0.16 px
 * at amount 1.04 over 5 s); at output resolution the integer rounding makes
 * the centre sit still for several frames then jump a full pixel — the
 * "trembling"/judder users see instead of smooth motion. Running zoompan on a
 * ~SUPERSAMPLE×-larger canvas (then letting its own `s=` downscale to target)
 * turns that 1-px step into a sub-pixel step at output, so the motion reads as
 * smooth. The working canvas is capped (SS_MAX_EDGE) to bound wasm memory.
 *
 * Applied AFTER the letterbox/fit chain, so no blank borders are exposed
 * (the trade-off is modest edge cropping while magnified). Returns null when
 * no zoom applies.
 */
/**
 * Supersample budgets. Smoothness is set by the supersample FACTOR (finer
 * input grid → sub-pixel crop origin → no judder). Images can afford a larger
 * canvas because their upscale is amortized: a still is animated from ONE input
 * frame via `zoompan d=N`, so the (expensive) upscale runs once, not per frame.
 * Video is upscaled every frame, so its canvas stays modest — and full-motion
 * video masks residual sub-pixel jitter anyway.
 */
const SS_MAX_EDGE_IMAGE = 6400;
const SS_FACTOR_IMAGE = 5;
const SS_MAX_EDGE_VIDEO = 3840;
const SS_FACTOR_VIDEO = 3;

export function zoomChain(
  zoom: ZoomEffectSettings,
  durationSeconds: number,
  s: RenderSettings,
  kind: "image" | "video" = "video",
): string | null {
  if (zoom.type === "none" || durationSeconds <= 0) return null;
  const amount = Math.min(
    ZOOM_LIMITS.max,
    Math.max(ZOOM_LIMITS.min, zoom.amount),
  );
  const A = amount.toFixed(4);
  // Total output frames across the segment; drives the animation progress.
  const n = Math.max(1, Math.round(durationSeconds * s.fps));
  // Comma inside function args must be escaped for the filtergraph parser.
  const z =
    zoom.type === "zoom-in"
      ? `min(1+(${A}-1)*on/${n}\\,${A})`
      : `max(${A}-(${A}-1)*on/${n}\\,1)`;
  // Supersample factor, reduced so the longer working edge never exceeds the
  // per-kind cap. High-resolution outputs already have sub-visible jitter, so
  // they naturally fall back toward factor 1 (no upscale).
  const maxEdge = kind === "image" ? SS_MAX_EDGE_IMAGE : SS_MAX_EDGE_VIDEO;
  const factorTarget = kind === "image" ? SS_FACTOR_IMAGE : SS_FACTOR_VIDEO;
  const factor = Math.max(
    1,
    Math.min(factorTarget, Math.floor(maxEdge / Math.max(s.width, s.height))),
  );
  // Keep dimensions even (yuv420p) — s.width/s.height are already even.
  const superSample =
    factor > 1 ? `scale=${s.width * factor}:${s.height * factor}:flags=bicubic,` : "";
  // Images: one input frame expanded to N output frames (d=N) so the upscale is
  // amortized. Video: one output frame per input frame (d=1); the clip's own
  // frames pace the animation.
  const d = kind === "image" ? n : 1;
  return (
    `${superSample}zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${d}:s=${s.width}x${s.height}:fps=${s.fps},setsar=1,format=yuv420p`
  );
}

/**
 * Fade the tail of a segment to black — used on the FINAL segment when the
 * cross-fade option is on, so the video dips to black at the end instead of
 * hard-cutting. Returns null when there is nothing to fade.
 */
export function fadeOutChain(
  fadeSeconds: number,
  segmentSeconds: number,
  fps: number,
): string | null {
  if (fadeSeconds <= 0 || segmentSeconds <= 0) return null;
  // Finish the fade a few frames BEFORE the segment ends so full black is
  // actually reached (and briefly held) on the final frames — otherwise frame
  // quantization and the filter's output PTS can leave the last frame a shade
  // above black.
  const frame = fps > 0 ? 1 / fps : 0;
  const margin = 3 * frame;
  const d = Math.min(fadeSeconds, Math.max(frame, segmentSeconds - margin));
  const st = Math.max(0, segmentSeconds - margin - d);
  return `fade=t=out:st=${st.toFixed(3)}:d=${d.toFixed(3)}:color=black`;
}

/**
 * Fade a segment IN from black over its opening — used on a title card so it
 * eases in rather than hard-cutting. Returns null when there is nothing to do.
 */
export function fadeInChain(fadeSeconds: number): string | null {
  if (fadeSeconds <= 0) return null;
  return `fade=t=in:st=0:d=${fadeSeconds.toFixed(3)}:color=black`;
}

/**
 * filter_complex for the soundtrack: a straight concat of the tracks, or —
 * when a cross-fade is requested and there are 2+ tracks — a chain of
 * `acrossfade` so each track dissolves into the next. Output pad is [out].
 * Inputs are expected as [0:a], [1:a], … in order. `crossfadeSeconds` must
 * already be clamped below the shortest track.
 */
export function buildSoundtrackFilter(
  trackCount: number,
  crossfadeSeconds: number,
): string {
  if (trackCount < 2) return "[0:a]anull[out]";
  if (crossfadeSeconds <= 0) {
    return (
      Array.from({ length: trackCount }, (_, i) => `[${i}:a]`).join("") +
      `concat=n=${trackCount}:v=0:a=1[out]`
    );
  }
  const d = crossfadeSeconds.toFixed(3);
  let prev = "[0:a]";
  const parts: string[] = [];
  for (let i = 1; i < trackCount; i++) {
    const out = i === trackCount - 1 ? "[out]" : `[axf${i}]`;
    parts.push(`${prev}[${i}:a]acrossfade=d=${d}:c1=tri:c2=tri${out}`);
    prev = `[axf${i}]`;
  }
  return parts.join(";");
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
