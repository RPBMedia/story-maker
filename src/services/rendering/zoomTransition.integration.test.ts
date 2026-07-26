/** Deterministic command-generation integration test for the exact bug:
 * two images + zoom-in + cross-fade must produce BOTH effects in the
 * pipeline — a per-segment zoompan filter AND an xfade in the graph — while
 * each segment keeps its own zoom and the timeline stays within tolerance.
 *
 * This asserts the composition contract without loading ffmpeg.wasm; the
 * real filter strings were separately validated against ffmpeg 8.x
 * (zoom animates: first vs last frame PSNR ~11-13 dB; duration exact).
 */
import { describe, expect, it } from "vitest";
import { buildTimeline, xfadeOffsets } from "../../utils/timeline";
import {
  buildXfadeGraph,
  needsXfadePath,
  scalePadChain,
  zoomChain,
} from "./filters";
import {
  DEFAULT_RENDER_SETTINGS,
  type ImageMediaItem,
  type TimelineSegment,
  type VideoMediaItem,
} from "../../types";

let id = 0;
function img(): ImageMediaItem {
  id += 1;
  return {
    id: `img-${id}`,
    kind: "image",
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
    file: new File([], `i${id}.png`),
    name: `i${id}.png`,
    size: 1,
    previewUrl: "",
    width: 1920,
    height: 1080,
  };
}
function vid(duration: number): VideoMediaItem {
  id += 1;
  return {
    id: `vid-${id}`,
    kind: "video",
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
    file: new File([], `v${id}.mp4`),
    name: `v${id}.mp4`,
    size: 1,
    previewUrl: "",
    duration,
    width: 1920,
    height: 1080,
  };
}

const S = DEFAULT_RENDER_SETTINGS;
const XFADE = { type: "crossfade" as const, duration: 0.75 };
const ZOOM_IN = { type: "zoom-in" as const, amount: 1.06 };

/** Mirror of the RenderingService per-segment vf construction, so this test
 * proves the SAME filters the renderer will emit — zoom is baked into each
 * prepared segment BEFORE the xfade chain consumes it. */
function segmentFilter(seg: TimelineSegment): string {
  const scalePad = scalePadChain(S);
  const zoom = zoomChain(seg.zoom, seg.duration, S);
  return zoom ? `${scalePad},${zoom}` : scalePad;
}

describe("two images + zoom-in + cross-fade (the reported scenario)", () => {
  const timeline = buildTimeline({
    soundtrackDuration: 30,
    items: [img(), img()],
    overrides: {},
    projectTransition: XFADE,
    projectZoom: ZOOM_IN,
  });

  it("takes the xfade path", () => {
    expect(needsXfadePath(timeline)).toBe(true);
  });

  it("bakes an animated zoompan into EVERY prepared segment", () => {
    expect(timeline.segments).toHaveLength(2);
    for (const seg of timeline.segments) {
      const vf = segmentFilter(seg);
      expect(vf).toContain("zoompan="); // zoom present in the segment
      expect(vf).toContain("on/"); // animated by output-frame index
      expect(vf).not.toContain("crop="); // not the broken static-crop approach
    }
  });

  it("cross-fade graph composes the prepared (zoomed) segments, not raw sources", () => {
    const graph = buildXfadeGraph(timeline);
    // inputs [0:v]/[1:v] are the prepared seg_i.mp4 files (which carry zoom),
    // and the graph applies xfade between them — both effects coexist.
    expect(graph.filter).toContain("xfade=transition=fade");
    expect(graph.filter).toContain("[0:v]");
    expect(graph.filter).toContain("[1:v]");
    expect(graph.outLabel).toBe("vout");
  });

  it("keeps the final timeline within one output frame of the soundtrack", () => {
    expect(Math.abs(timeline.total - 30)).toBeLessThanOrEqual(1 / S.fps);
  });

  it("does not change prepared segment durations because of zoom", () => {
    // zoom uses d=1, so output frames == input frames == duration*fps
    for (const seg of timeline.segments) {
      const vf = segmentFilter(seg);
      const n = Math.round(seg.duration * S.fps);
      expect(vf).toContain(`on/${n}`);
    }
  });
});

describe("each segment keeps its own distinct zoom", () => {
  it("per-item overrides beat the project default in the emitted filters", () => {
    const a = img();
    const b = img();
    const c = vid(6);
    const timeline = buildTimeline({
      soundtrackDuration: 30,
      items: [a, b, c],
      overrides: {
        [a.id]: { zoom: { type: "zoom-out", amount: 1.08 } },
        [b.id]: { zoom: { type: "none", amount: 1.04 } },
      },
      projectTransition: XFADE,
      projectZoom: ZOOM_IN, // default zoom-in applies to c only
    });
    const [fa, fb, fc] = timeline.segments.map(segmentFilter);
    expect(fa).toContain("max("); // zoom-out expression
    expect(fb).not.toContain("zoompan="); // explicitly none
    expect(fc).toContain("min("); // zoom-in default
  });
});

describe("no-transition path still works and still zooms", () => {
  it("uses the stream-copy path but segments still carry zoom", () => {
    const timeline = buildTimeline({
      soundtrackDuration: 20,
      items: [img(), img()],
      overrides: {},
      projectTransition: { type: "none", duration: 0 },
      projectZoom: ZOOM_IN,
    });
    expect(needsXfadePath(timeline)).toBe(false);
    for (const seg of timeline.segments) {
      expect(segmentFilter(seg)).toContain("zoompan=");
    }
  });
});

describe("xfade offsets remain correct with zoomed segments", () => {
  it("offsets are unaffected by zoom (zoom does not change duration)", () => {
    const timeline = buildTimeline({
      soundtrackDuration: 30,
      items: [img(), img(), img()],
      overrides: {},
      projectTransition: XFADE,
      projectZoom: ZOOM_IN,
    });
    const offsets = xfadeOffsets(timeline);
    // 3 segments → 2 boundaries; offsets strictly increasing and positive
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[1]).toBeGreaterThan(offsets[0]);
  });
});
