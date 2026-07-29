/** Effect-aware timeline: duration allocation + cross-fade overlap.
 *
 * A cross-fade OVERLAPS the outgoing and incoming segments, so a naive
 * timeline of allocated durations would come out shorter than the soundtrack
 * by the sum of overlaps. This module makes the two agree again:
 *
 *   pass 1 — allocate durations against the plain soundtrack, resolve each
 *            boundary's transition, and clamp its overlap to what the two
 *            neighboring segments can safely give (45% of the shorter one);
 *   pass 2 — re-allocate against (soundtrack + total overlap) so stretchable
 *            content (images, or the freeze tail when there are none) absorbs
 *            exactly the time the overlaps consume.
 *
 * Result: sum(durations) − sum(overlaps) = soundtrack duration, exactly
 * (drift is absorbed by the final segment inside allocateDurations).
 * The transition belongs to the boundary AFTER an item; the final item never
 * has an outgoing transition.
 */
import type {
  DurationPlan,
  EffectiveTimeline,
  TimelineSegment,
  TransitionBoundary,
  TransitionSettings,
  ZoomEffectSettings,
} from "../types";
import { allocateDurations, round } from "./duration";
import {
  effectiveTransition,
  effectiveZoom,
  safeOverlap,
  type OverridesByItem,
} from "./effects";
import type { VisualMediaItem } from "../types";

export interface TimelineInput {
  soundtrackDuration: number;
  items: VisualMediaItem[];
  overrides: OverridesByItem;
  projectTransition: TransitionSettings;
  projectZoom: ZoomEffectSettings;
}

export function buildTimeline(input: TimelineInput): EffectiveTimeline {
  const {
    soundtrackDuration,
    items,
    overrides,
    projectTransition,
    projectZoom,
  } = input;

  // Pass 1: plain allocation to learn base durations for clamping.
  const base = allocateDurations(soundtrackDuration, items);
  if (base.segments.length === 0) {
    return emptyTimeline();
  }

  // Iterate to a fixed point: overlaps consume time -> budget grows ->
  // stretchable segments grow -> clamps loosen -> overlaps may grow toward
  // the requested value. Overlaps are monotonically non-decreasing and
  // bounded by the request, so this converges; iterations are capped and any
  // residual drift is absorbed below.
  let plan = base;
  let finalBoundaries = resolveBoundaries(plan, overrides, projectTransition);
  for (let iter = 0; iter < 6; iter++) {
    const overlapSum = finalBoundaries.reduce((s, b) => s + b.overlap, 0);
    if (overlapSum === 0) break;
    const next = allocateDurations(
      round(soundtrackDuration + overlapSum),
      base.segments.map((s) => s.item), // only items that survived pass 1
    );
    const nextBoundaries = resolveBoundaries(
      next,
      overrides,
      projectTransition,
    );
    const nextSum = nextBoundaries.reduce((s, b) => s + b.overlap, 0);
    plan = next;
    if (Math.abs(nextSum - overlapSum) < 1e-6) {
      finalBoundaries = nextBoundaries;
      break;
    }
    finalBoundaries = nextBoundaries;
  }
  const finalOverlap = round(
    finalBoundaries.reduce((s, b) => s + b.overlap, 0),
  );

  // Exactness correction: force sum(durations) - sum(overlaps) to equal the
  // soundtrack by adjusting the final segment (rules 10-11 of the base
  // allocator, extended to the overlapped timeline).
  const durSum = plan.segments.reduce((s, x) => s + x.duration, 0);
  const drift = round(soundtrackDuration + finalOverlap - durSum);
  if (plan.segments.length > 0 && drift !== 0) {
    const last = plan.segments[plan.segments.length - 1];
    const corrected = round(last.duration + drift);
    if (corrected > 0) {
      if (last.item.kind === "video") {
        last.trimTo =
          corrected < last.item.duration ? corrected : undefined;
      }
      last.duration = corrected;
    }
  }

  // Place segments on the shared output clock.
  const segments: TimelineSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const start = round(cursor);
    const end = round(start + seg.duration);
    segments.push({
      item: seg.item,
      duration: seg.duration,
      trimTo: seg.trimTo,
      start,
      end,
      zoom: effectiveZoom(seg.item.id, overrides, projectZoom),
    });
    const overlapAfter =
      finalBoundaries.find((b) => b.afterIndex === i)?.overlap ?? 0;
    cursor = end - overlapAfter;
  }

  const total = round(segments.length ? segments[segments.length - 1].end : 0);

  // End-of-video fade to black: only when the cross-fade option is on. Clamped
  // so it never consumes more than 90% of the final segment.
  const lastSeg = segments[segments.length - 1];
  const endFade =
    projectTransition.type === "crossfade" && lastSeg
      ? round(Math.max(0, Math.min(projectTransition.duration, lastSeg.duration * 0.9)))
      : 0;

  return {
    segments,
    boundaries: finalBoundaries,
    totalOverlap: finalOverlap,
    total,
    freezeTail: plan.freezeTail,
    trimmed: plan.trimmed,
    anyClamped: finalBoundaries.some((b) => b.clamped),
    endFade,
  };
}

function resolveBoundaries(
  plan: DurationPlan,
  overrides: OverridesByItem,
  projectTransition: TransitionSettings,
): TransitionBoundary[] {
  const boundaries: TransitionBoundary[] = [];
  // The final item has no outgoing transition — iterate to length - 2.
  for (let i = 0; i < plan.segments.length - 1; i++) {
    const outgoing = plan.segments[i];
    const incoming = plan.segments[i + 1];
    const t = effectiveTransition(
      outgoing.item.id,
      overrides,
      projectTransition,
    );
    if (t.type === "none") {
      boundaries.push({
        afterIndex: i,
        type: "none",
        requested: 0,
        overlap: 0,
        clamped: false,
      });
      continue;
    }
    const overlap = round(
      safeOverlap(t.duration, outgoing.duration, incoming.duration),
    );
    boundaries.push({
      afterIndex: i,
      type: t.type,
      requested: t.duration,
      overlap,
      clamped: overlap < t.duration - 1e-9,
    });
  }
  return boundaries;
}

/**
 * Cumulative xfade offsets for the ffmpeg filter chain.
 *
 * Chained xfades operate on the progressively-combined stream, so the offset
 * of transition k is the duration of the combined stream so far minus the
 * overlap being consumed:
 *   offset_k = Σ dur(0..k) − Σ overlap(0..k−1) − overlap_k
 */
export function xfadeOffsets(timeline: EffectiveTimeline): number[] {
  const offsets: number[] = [];
  let combined = 0;
  for (let i = 0; i < timeline.segments.length - 1; i++) {
    combined += timeline.segments[i].duration;
    const b = timeline.boundaries.find((x) => x.afterIndex === i);
    const overlap = b?.overlap ?? 0;
    if (b && b.type !== "none" && overlap > 0) {
      offsets.push(round(combined - overlap));
    } else {
      offsets.push(-1); // sentinel: hard cut at this boundary
    }
    combined = round(combined - overlap);
  }
  return offsets;
}

function emptyTimeline(): EffectiveTimeline {
  return {
    segments: [],
    boundaries: [],
    totalOverlap: 0,
    total: 0,
    freezeTail: 0,
    trimmed: false,
    anyClamped: false,
    endFade: 0,
  };
}
