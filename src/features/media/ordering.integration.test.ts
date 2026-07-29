/**
 * Integration: prove that reordering the sequence flows all the way through to
 * the render plan. The renderer consumes `buildTimeline(...).segments` in order
 * and each item's zoom/transition lives in an id-keyed override map, so these
 * assertions stand in for "the exported video matches the visible order".
 */
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../../utils/timeline";
import { sortVisualItems, shuffleDistinct } from "../../utils/ordering";
import type {
  ImageMediaItem,
  TransitionSettings,
  VisualMediaItem,
  ZoomEffectSettings,
} from "../../types";
import type { OverridesByItem } from "../../utils/effects";

function img(id: string, name: string, createdAt: number): ImageMediaItem {
  return {
    id,
    kind: "image",
    file: new File([], name),
    name,
    size: 1,
    previewUrl: "",
    width: 1920,
    height: 1080,
    createdAt,
    dateSource: "upload-time",
  };
}

const ids = (items: { item: VisualMediaItem }[]) =>
  items.map((s) => s.item.id);

const CROSSFADE: TransitionSettings = { type: "crossfade", duration: 0.5 };
const NO_ZOOM: ZoomEffectSettings = { type: "none", amount: 1.04 };

// Per-item zoom overrides — these must follow the item, not the slot.
const overrides: OverridesByItem = {
  b: { zoom: { type: "zoom-in", amount: 1.06 } },
  d: { zoom: { type: "zoom-out", amount: 1.08 } },
};

const seq = [
  img("a", "IMG_2.jpg", 300),
  img("b", "IMG_10.jpg", 100),
  img("c", "IMG_1.jpg", 400),
  img("d", "IMG_9.jpg", 200),
];

function timelineFor(items: VisualMediaItem[]) {
  return buildTimeline({
    soundtrackDuration: 12,
    items,
    overrides,
    projectTransition: CROSSFADE,
    projectZoom: NO_ZOOM,
  });
}

describe("ordering → render plan", () => {
  it("render payload order equals the sorted (visible) order", () => {
    const sorted = sortVisualItems(seq, "name-asc");
    const t = timelineFor(sorted);
    // natural filename order: IMG_1, IMG_2, IMG_9, IMG_10
    expect(ids(t.segments)).toEqual(["c", "a", "d", "b"]);
  });

  it("render payload order equals the shuffled (visible) order", () => {
    const shuffled = shuffleDistinct(seq, () => 0.999999); // forces a swap
    const t = timelineFor(shuffled);
    expect(ids(t.segments)).toEqual(shuffled.map((i) => i.id));
  });

  it("zoom settings travel with the item across reordering", () => {
    const sorted = sortVisualItems(seq, "date-asc"); // b,d,a,c by createdAt
    const t = timelineFor(sorted);
    const zoomById = new Map(
      t.segments.map((s) => [s.item.id, s.zoom] as const),
    );
    expect(zoomById.get("b")).toEqual({ type: "zoom-in", amount: 1.06 });
    expect(zoomById.get("d")).toEqual({ type: "zoom-out", amount: 1.08 });
    expect(zoomById.get("a")?.type).toBe("none");
    expect(zoomById.get("c")?.type).toBe("none");
  });

  it("rebuilds transition boundaries; the final item has none", () => {
    const sorted = sortVisualItems(seq, "name-desc");
    const t = timelineFor(sorted);
    // one boundary between each consecutive pair, none after the last item
    expect(t.boundaries).toHaveLength(sorted.length - 1);
    const afterIndexes = t.boundaries.map((b) => b.afterIndex).sort();
    expect(afterIndexes).toEqual([0, 1, 2]);
    expect(t.boundaries.some((b) => b.afterIndex === sorted.length - 1)).toBe(
      false,
    );
  });

  it("preserves total duration (equals the soundtrack) regardless of order", () => {
    const original = timelineFor(seq);
    const shuffled = timelineFor(shuffleDistinct(seq, () => 0.999999));
    expect(original.total).toBeCloseTo(12, 3);
    expect(shuffled.total).toBeCloseTo(12, 3);
  });
});
