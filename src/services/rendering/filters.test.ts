import { describe, expect, it } from "vitest";
import {
  buildXfadeGraph,
  needsXfadePath,
  scalePadChain,
  zoomChain,
} from "./filters";
import { buildTimeline } from "../../utils/timeline";
import {
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_TRANSITION,
  DEFAULT_ZOOM,
  ZOOM_LIMITS,
  type ImageMediaItem,
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
    width: 800,
    height: 600,
  };
}

const S = DEFAULT_RENDER_SETTINGS;

describe("zoomChain", () => {
  it("returns null for no zoom", () => {
    expect(zoomChain({ type: "none", amount: 1.04 }, 5, S)).toBeNull();
  });

  it("returns null for non-positive duration", () => {
    expect(zoomChain({ type: "zoom-in", amount: 1.04 }, 0, S)).toBeNull();
  });

  it("uses zoompan (per-frame animated) not a static crop", () => {
    const f = zoomChain({ type: "zoom-in", amount: 1.06 }, 4, S)!;
    // The old crop-based approach never animated (crop size is init-only);
    // zoompan re-evaluates per output frame. Guard against regressing to crop.
    expect(f).toContain("zoompan=");
    expect(f).not.toContain("crop=");
  });

  it("animates zoom-in via the output-frame index (on), clamped to the target", () => {
    // 4s * 30fps = 120 frames of progress
    const f = zoomChain({ type: "zoom-in", amount: 1.06 }, 4, S)!;
    expect(f).toContain("min(1+(1.0600-1)*on/120\\,1.0600)");
    expect(f).toContain("d=1"); // 1 output frame per input frame → exact duration
    expect(f).toContain(`s=${S.width}x${S.height}`);
    expect(f).toContain(`fps=${S.fps}`);
  });

  it("animates zoom-out from the enlarged scale down to framed", () => {
    const f = zoomChain({ type: "zoom-out", amount: 1.1 }, 2, S)!;
    // 2s * 30fps = 60 frames
    expect(f).toContain("max(1.1000-(1.1000-1)*on/60\\,1)");
  });

  it("keeps output geometry fixed (encoder-compatible) and SAR normalized", () => {
    const f = zoomChain({ type: "zoom-in", amount: 1.04 }, 3, S)!;
    expect(f).toContain("s=1280x720");
    expect(f).toContain("setsar=1");
    expect(f).toContain("format=yuv420p");
  });

  it("clamps invalid zoom amounts into the safe range", () => {
    const tooBig = zoomChain({ type: "zoom-in", amount: 9 }, 4, S)!;
    expect(tooBig).toContain(`(${ZOOM_LIMITS.max.toFixed(4)}-1)`);
    const tooSmall = zoomChain({ type: "zoom-in", amount: 1.0 }, 4, S)!;
    expect(tooSmall).toContain(`(${ZOOM_LIMITS.min.toFixed(4)}-1)`);
  });
});

describe("buildXfadeGraph", () => {
  const XFADE = { type: "crossfade" as const, duration: 0.75 };

  it("chains xfade filters with cumulative offsets", () => {
    const t = buildTimeline({
      soundtrackDuration: 30,
      items: [img(), img(), img()],
      overrides: {},
      projectTransition: XFADE,
      projectZoom: DEFAULT_ZOOM,
    });
    const g = buildXfadeGraph(t);
    expect(g.filter).toBe(
      "[0:v][1:v]xfade=transition=fade:duration=0.750:offset=9.750[vx1];" +
        "[vx1][2:v]xfade=transition=fade:duration=0.750:offset=19.500[vout]",
    );
    expect(g.outLabel).toBe("vout");
  });

  it("uses concat for hard-cut boundaries in mixed sequences", () => {
    const a = img();
    const t = buildTimeline({
      soundtrackDuration: 30,
      items: [a, img(), img()],
      overrides: { [a.id]: { transition: { type: "none", duration: 0 } } },
      projectTransition: XFADE,
      projectZoom: DEFAULT_ZOOM,
    });
    const g = buildXfadeGraph(t);
    expect(g.filter).toContain("concat=n=2:v=1:a=0[vx1]");
    expect(g.filter).toContain("xfade=transition=fade");
  });

  it("needsXfadePath is false for plain projects", () => {
    const t = buildTimeline({
      soundtrackDuration: 30,
      items: [img(), img()],
      overrides: {},
      projectTransition: DEFAULT_TRANSITION,
      projectZoom: DEFAULT_ZOOM,
    });
    expect(needsXfadePath(t)).toBe(false);
  });
});

describe("scalePadChain", () => {
  it("normalizes to the configured geometry", () => {
    expect(scalePadChain(S)).toBe(
      "scale=1280:720:force_original_aspect_ratio=decrease," +
        "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p",
    );
  });
});
