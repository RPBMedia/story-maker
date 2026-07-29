import { describe, expect, it } from "vitest";
import { buildTimeline, xfadeOffsets } from "./timeline";
import { round } from "./duration";
import {
  DEFAULT_TRANSITION,
  DEFAULT_ZOOM,
  type ImageMediaItem,
  type TransitionSettings,
  type VideoMediaItem,
  type ZoomEffectSettings,
} from "../types";

let id = 0;
function img(): ImageMediaItem {
  id += 1;
  return {
    id: `img-${id}`,
    kind: "image",
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
    file: new File([], `img-${id}.png`),
    name: `img-${id}.png`,
    size: 1,
    previewUrl: "",
    width: 800,
    height: 600,
  };
}
function vid(duration: number): VideoMediaItem {
  id += 1;
  return {
    id: `vid-${id}`,
    kind: "video",
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
    file: new File([], `vid-${id}.mp4`),
    name: `vid-${id}.mp4`,
    size: 1,
    previewUrl: "",
    duration,
    width: 1280,
    height: 720,
  };
}

const XFADE: TransitionSettings = { type: "crossfade", duration: 0.75 };
const ZOOM_IN: ZoomEffectSettings = { type: "zoom-in", amount: 1.04 };

function build(
  soundtrack: number,
  items: (ImageMediaItem | VideoMediaItem)[],
  projectTransition = DEFAULT_TRANSITION,
  overrides = {},
  projectZoom = DEFAULT_ZOOM,
) {
  return buildTimeline({
    soundtrackDuration: soundtrack,
    items,
    overrides,
    projectTransition,
    projectZoom,
  });
}

describe("buildTimeline — no transitions preserves existing behavior", () => {
  it("matches the plain allocation and soundtrack total", () => {
    const t = build(30, [img(), vid(10), img()]);
    expect(t.segments.map((s) => s.duration)).toEqual([10, 10, 10]);
    expect(t.totalOverlap).toBe(0);
    expect(t.total).toBe(30);
    expect(t.boundaries.every((b) => b.type === "none")).toBe(true);
    expect(t.anyClamped).toBe(false);
  });
});

describe("buildTimeline — end fade to black", () => {
  it("adds an end fade only when the cross-fade option is on", () => {
    expect(build(30, [img(), img(), img()]).endFade).toBe(0); // no transitions
    const faded = build(30, [img(), img(), img()], XFADE);
    expect(faded.endFade).toBeGreaterThan(0);
    expect(faded.endFade).toBe(0.75); // the cross-fade duration
  });

  it("never lets the end fade exceed the final segment", () => {
    // one very short final segment + long crossfade request
    const t = build(1, [img()], { type: "crossfade", duration: 3 });
    expect(t.endFade).toBeGreaterThan(0);
    expect(t.endFade).toBeLessThanOrEqual(t.segments[t.segments.length - 1].duration);
  });
});

describe("buildTimeline — cross-fade overlap", () => {
  it("keeps the effective total equal to the soundtrack", () => {
    const t = build(30, [img(), img(), img()], XFADE);
    // 2 boundaries * 0.75s overlap => durations must sum to 31.5
    const durSum = round(t.segments.reduce((s, x) => s + x.duration, 0));
    expect(t.totalOverlap).toBe(1.5);
    expect(durSum).toBe(31.5);
    expect(t.total).toBe(30);
  });

  it("gives the final item no outgoing transition", () => {
    const t = build(30, [img(), img(), img()], XFADE);
    expect(t.boundaries).toHaveLength(2); // 3 items -> 2 boundaries only
    expect(t.boundaries.map((b) => b.afterIndex)).toEqual([0, 1]);
  });

  it("videos keep their duration; images absorb the overlap", () => {
    const t = build(30, [img(), vid(10), img()], XFADE);
    const v = t.segments.find((s) => s.item.kind === "video")!;
    expect(v.duration).toBe(10);
    expect(t.total).toBe(30);
  });

  it("clamps transitions between short segments and flags it", () => {
    // 2s soundtrack over 4 images -> 0.5s+ each; 0.75s xfade must clamp
    const t = build(2, [img(), img(), img(), img()], XFADE);
    for (const b of t.boundaries) {
      expect(b.overlap).toBeLessThan(0.75);
      expect(b.clamped).toBe(true);
      expect(b.overlap).toBeGreaterThan(0);
    }
    expect(t.anyClamped).toBe(true);
    expect(t.total).toBe(2);
  });

  it("resolves mixed per-item overrides", () => {
    const a = img();
    const b = img();
    const c = img();
    const overrides = {
      [a.id]: { transition: { type: "none", duration: 0 } as const },
    };
    const t = build(30, [a, b, c], XFADE, overrides);
    expect(t.boundaries[0].type).toBe("none"); // a -> b overridden off
    expect(t.boundaries[1].type).toBe("crossfade"); // b -> c project default
    expect(t.total).toBe(30);
  });

  it("stays within one output frame of the soundtrack for awkward durations", () => {
    for (const dur of [7.1, 13.37, 61.007, 179.999]) {
      const t = build(dur, [img(), vid(3.21), img(), img()], XFADE);
      expect(Math.abs(t.total - round(dur))).toBeLessThanOrEqual(1 / 30);
    }
  });

  it("videos-only projects grow the freeze tail to cover the overlap", () => {
    const t = build(20, [vid(6), vid(6)], XFADE);
    const durSum = round(t.segments.reduce((s, x) => s + x.duration, 0));
    expect(round(durSum - t.totalOverlap)).toBe(20);
    expect(t.total).toBe(20);
    expect(t.freezeTail).toBeGreaterThan(8); // base 8s + overlap compensation
  });
});

describe("xfadeOffsets", () => {
  it("computes cumulative offsets on the combined stream", () => {
    const t = build(30, [img(), img(), img()], XFADE);
    // durations 10.5 each, overlap 0.75:
    // offset0 = 10.5 - 0.75 = 9.75
    // offset1 = (10.5 + 10.5 - 0.75) - 0.75 = 19.5
    expect(xfadeOffsets(t)).toEqual([9.75, 19.5]);
  });

  it("marks hard cuts with -1", () => {
    const a = img();
    const overrides = {
      [a.id]: { transition: { type: "none", duration: 0 } as const },
    };
    const t = build(30, [a, img(), img()], XFADE, overrides);
    const offsets = xfadeOffsets(t);
    expect(offsets[0]).toBe(-1);
    expect(offsets[1]).toBeGreaterThan(0);
  });
});

describe("zoom resolution in timeline", () => {
  it("applies project default and clamps amounts", () => {
    const t = build(10, [img(), img()], DEFAULT_TRANSITION, {}, {
      type: "zoom-in",
      amount: 9,
    });
    for (const s of t.segments) {
      expect(s.zoom.type).toBe("zoom-in");
      expect(s.zoom.amount).toBe(1.1); // clamped to max
    }
  });

  it("item override beats project default; missing override inherits", () => {
    const a = img();
    const b = img();
    const overrides = {
      [a.id]: { zoom: { type: "none", amount: 1.04 } as const },
    };
    const t = build(10, [a, b], DEFAULT_TRANSITION, overrides, ZOOM_IN);
    expect(t.segments[0].zoom.type).toBe("none");
    expect(t.segments[1].zoom.type).toBe("zoom-in");
  });

  it("old items with no overrides default to no zoom", () => {
    const t = build(10, [img()]);
    expect(t.segments[0].zoom.type).toBe("none");
  });
});
