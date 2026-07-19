import type {
  AllocatedSegment,
  DurationPlan,
  VisualMediaItem,
} from "../types";

export const MIN_IMAGE_DURATION = 1;

/**
 * Allocate output-timeline durations to an ordered visual sequence so the
 * visuals exactly fill the soundtrack. Pure and side-effect free.
 *
 * Rules (in priority order):
 *  - videos keep their source duration where possible;
 *  - the time left after videos is split evenly across images;
 *  - images get at least MIN_IMAGE_DURATION when possible, else the remaining
 *    time is split proportionally (evenly) even if below the minimum;
 *  - if videos alone exceed the soundtrack, the sequence is trimmed at the
 *    soundtrack endpoint (later items get 0 and are dropped);
 *  - if visuals end early and no images exist to stretch, the last video
 *    freezes its final frame until the soundtrack ends;
 *  - the final segment absorbs floating-point drift so the plan total always
 *    equals the soundtrack duration exactly.
 */
export function allocateDurations(
  soundtrackDuration: number,
  items: VisualMediaItem[],
): DurationPlan {
  if (soundtrackDuration <= 0 || items.length === 0) {
    return { segments: [], freezeTail: 0, total: 0, trimmed: false };
  }

  const videos = items.filter((i) => i.kind === "video");
  const images = items.filter((i) => i.kind === "image");
  const videoTotal = videos.reduce((s, v) => s + v.duration, 0);

  // Case: videos alone meet or exceed the soundtrack -> trim at the endpoint.
  if (videoTotal >= soundtrackDuration && images.length === 0) {
    return trimAtSoundtrack(soundtrackDuration, items);
  }

  if (images.length === 0) {
    // Videos only, ending early: freeze the last frame to fill the gap.
    const segments: AllocatedSegment[] = items.map((item) => ({
      item,
      duration: item.kind === "video" ? item.duration : 0,
    }));
    const freezeTail = round(soundtrackDuration - videoTotal);
    if (segments.length > 0 && freezeTail > 0) {
      const last = segments[segments.length - 1];
      last.duration = round(last.duration + freezeTail);
    }
    return {
      segments,
      freezeTail,
      total: round(soundtrackDuration),
      trimmed: false,
    };
  }

  // Images present.
  const remaining = soundtrackDuration - videoTotal;
  if (remaining <= 0) {
    // Videos already exceed the soundtrack: images get no time; trim videos.
    return trimAtSoundtrack(soundtrackDuration, items);
  }

  // Even split across images; below-minimum splits are allowed when the
  // remaining time cannot give every image the minimum (rule 9).
  const perImage = remaining / images.length;
  const segments: AllocatedSegment[] = items.map((item) => ({
    item,
    duration: item.kind === "video" ? item.duration : round(perImage),
  }));

  return finalizeExact(soundtrackDuration, segments, false);
}

/** Walk the sequence and cut it exactly at the soundtrack endpoint. */
function trimAtSoundtrack(
  soundtrackDuration: number,
  items: VisualMediaItem[],
): DurationPlan {
  const segments: AllocatedSegment[] = [];
  let used = 0;
  for (const item of items) {
    const source = item.kind === "video" ? item.duration : 0;
    if (used >= soundtrackDuration) break; // no room left; drop the rest
    const room = soundtrackDuration - used;
    if (item.kind === "video") {
      const take = Math.min(source, room);
      segments.push({
        item,
        duration: round(take),
        trimTo: take < source ? round(take) : undefined,
      });
      used += take;
    }
    // images contribute 0 here (no remaining time exists for them)
  }
  return finalizeExact(soundtrackDuration, segments, true);
}

/**
 * Force the plan total to equal the soundtrack duration exactly by adjusting
 * the final segment (rules 10-11).
 */
function finalizeExact(
  soundtrackDuration: number,
  segments: AllocatedSegment[],
  trimmed: boolean,
): DurationPlan {
  const kept = segments.filter((s) => s.duration > 0);
  const total = kept.reduce((s, seg) => s + seg.duration, 0);
  const drift = round(soundtrackDuration - total);
  if (kept.length > 0 && drift !== 0) {
    const last = kept[kept.length - 1];
    const corrected = round(last.duration + drift);
    if (corrected > 0) {
      // A video stretched by drift correction must trim/freeze accordingly.
      if (last.item.kind === "video") {
        if (corrected < last.item.duration) {
          last.trimTo = corrected;
        } else {
          last.trimTo = undefined;
        }
      }
      last.duration = corrected;
    }
  }
  return {
    segments: kept,
    freezeTail: freezeTailOf(kept),
    total: round(kept.reduce((s, seg) => s + seg.duration, 0)),
    trimmed,
  };
}

/** Seconds of freeze-frame implied by the last segment exceeding its source. */
function freezeTailOf(segments: AllocatedSegment[]): number {
  if (segments.length === 0) return 0;
  const last = segments[segments.length - 1];
  if (last.item.kind !== "video") return 0;
  const excess = last.duration - last.item.duration;
  return excess > 0.001 ? round(excess) : 0;
}

/** Round to milliseconds — fine-grained enough for ffmpeg, coarse enough to
 * kill floating-point noise. */
export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
