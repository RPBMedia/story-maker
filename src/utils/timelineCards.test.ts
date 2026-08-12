import { describe, expect, it } from "vitest";
import { buildTimelineWithCards, type CardTimelineInput } from "./timeline";
import {
  DEFAULT_TRANSITION,
  DEFAULT_ZOOM,
  type ImageMediaItem,
  type VisualMediaItem,
} from "../types";

function img(id: string, createdAt: number): ImageMediaItem {
  return {
    id, file: new File([new Blob(["x"])], `${id}.jpg`, { type: "image/jpeg" }),
    name: `${id}.jpg`, size: 1, previewUrl: `blob:${id}`,
    createdAt, dateSource: "upload-time", kind: "image", width: 1920, height: 1080,
  };
}

function baseInput(items: VisualMediaItem[], soundtrackDuration: number) {
  return {
    soundtrackDuration,
    items,
    overrides: {},
    projectTransition: DEFAULT_TRANSITION,
    projectZoom: DEFAULT_ZOOM,
  };
}

const titleCard = (over: Partial<CardTimelineInput> = {}): CardTimelineInput => ({
  item: img("__title__", 0), role: "title", durationSeconds: 3, fade: true, zoom: DEFAULT_ZOOM, ...over,
});
const endCard = (over: Partial<CardTimelineInput> = {}): CardTimelineInput => ({
  item: img("__end__", 0), role: "end", durationSeconds: 2, fade: true, zoom: DEFAULT_ZOOM, ...over,
});

describe("buildTimelineWithCards", () => {
  it("reserves fixed card time and keeps the total equal to the soundtrack", () => {
    const items = [img("a", 1), img("b", 2)];
    const tl = buildTimelineWithCards(baseInput(items, 10), {
      title: titleCard(),
      end: endCard(),
    });
    // title + 2 media + end
    expect(tl.segments).toHaveLength(4);
    expect(tl.total).toBeCloseTo(10, 3);

    const [t, m1, m2, e] = tl.segments;
    expect(t.card).toEqual({ role: "title", fade: true });
    expect(t.start).toBe(0);
    expect(t.end).toBeCloseTo(3, 3);
    // media shares the remaining 5s → 2.5s each, starting after the title
    expect(m1.start).toBeCloseTo(3, 3);
    expect(m1.duration).toBeCloseTo(2.5, 3);
    expect(m2.end).toBeCloseTo(8, 3);
    expect(e.card).toEqual({ role: "end", fade: true });
    expect(e.start).toBeCloseTo(8, 3);
    expect(e.end).toBeCloseTo(10, 3);
    // the end card owns the closing fade, so media endFade is cleared
    expect(tl.endFade).toBe(0);
  });

  it("supports a title card only (no end)", () => {
    const tl = buildTimelineWithCards(baseInput([img("a", 1)], 8), { title: titleCard({ durationSeconds: 2 }) });
    expect(tl.segments).toHaveLength(2);
    expect(tl.segments[0].card?.role).toBe("title");
    expect(tl.segments[1].start).toBeCloseTo(2, 3);
    expect(tl.segments[1].end).toBeCloseTo(8, 3);
  });

  it("falls back to a plain timeline when no cards are enabled", () => {
    const tl = buildTimelineWithCards(baseInput([img("a", 1)], 8), {});
    expect(tl.segments).toHaveLength(1);
    expect(tl.segments[0].card).toBeUndefined();
  });

  it("carries the resolved zoom onto the card segment", () => {
    const tl = buildTimelineWithCards(baseInput([img("a", 1)], 8), {
      title: titleCard({ zoom: { type: "zoom-in", amount: 1.05 } }),
    });
    expect(tl.segments[0].zoom).toEqual({ type: "zoom-in", amount: 1.05 });
  });
});
