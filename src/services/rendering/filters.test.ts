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
  type ImageMediaItem,
} from "../../types";

let id = 0;
function img(): ImageMediaItem {
  id += 1;
  return {
    id: `img-${id}`,
    kind: "image",
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

  it("builds a zoom-in crop expression ending at the target scale", () => {
    const f = zoomChain({ type: "zoom-in", amount: 1.06 }, 4, S)!;
    expect(f).toContain("crop=");
    expect(f).toContain("(1+(1.0600-1)*min(t/4.000\\,1))");
    expect(f).toContain(`scale=${S.width}:${S.height}`);
  });

  it("builds a zoom-out expression starting enlarged and ending framed", () => {
    const f = zoomChain({ type: "zoom-out", amount: 1.1 }, 2.5, S)!;
    expect(f).toContain("(1.1000-(1.1000-1)*min(t/2.500\\,1))");
  });

  it("keeps output dimensions fixed and valid", () => {
    const f = zoomChain({ type: "zoom-in", amount: 1.04 }, 3, S)!;
    expect(f.endsWith(`scale=1280:720,setsar=1`)).toBe(true);
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
