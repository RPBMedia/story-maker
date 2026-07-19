import { describe, expect, it } from "vitest";
import { allocateDurations, round } from "./duration";
import type { ImageMediaItem, VideoMediaItem } from "../types";

let id = 0;
function img(): ImageMediaItem {
  id += 1;
  return {
    id: `img-${id}`,
    kind: "image",
    file: new File([], `img-${id}.png`),
    name: `img-${id}.png`,
    size: 1000,
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
    file: new File([], `vid-${id}.mp4`),
    name: `vid-${id}.mp4`,
    size: 1000,
    previewUrl: "",
    duration,
    width: 1280,
    height: 720,
  };
}

describe("allocateDurations", () => {
  it("returns an empty plan for empty inputs", () => {
    expect(allocateDurations(10, []).segments).toEqual([]);
    expect(allocateDurations(0, [img()]).segments).toEqual([]);
    expect(allocateDurations(-5, [img()]).segments).toEqual([]);
  });

  it("splits the full soundtrack evenly across images only", () => {
    const plan = allocateDurations(30, [img(), img(), img()]);
    expect(plan.segments.map((s) => s.duration)).toEqual([10, 10, 10]);
    expect(plan.total).toBe(30);
    expect(plan.freezeTail).toBe(0);
    expect(plan.trimmed).toBe(false);
  });

  it("preserves video durations and gives images the remainder", () => {
    const plan = allocateDurations(30, [img(), vid(10), img()]);
    expect(plan.segments.map((s) => s.duration)).toEqual([10, 10, 10]);
    expect(plan.total).toBe(30);
  });

  it("supports interleaved sequences in one shared timeline", () => {
    const plan = allocateDurations(60, [img(), vid(15), img(), img(), vid(15)]);
    expect(plan.segments.map((s) => s.item.kind)).toEqual([
      "image",
      "video",
      "image",
      "image",
      "video",
    ]);
    expect(plan.segments.map((s) => s.duration)).toEqual([10, 15, 10, 10, 15]);
    expect(plan.total).toBe(60);
  });

  it("reduces image durations below the 1s minimum when time is short", () => {
    // 2s left across 4 images -> 0.5s each; must not error or drop images.
    const plan = allocateDurations(12, [vid(10), img(), img(), img(), img()]);
    const imgs = plan.segments.filter((s) => s.item.kind === "image");
    expect(imgs.map((s) => s.duration)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(plan.total).toBe(12);
  });

  it("trims videos at the soundtrack endpoint when they exceed it", () => {
    const plan = allocateDurations(12, [vid(10), vid(10)]);
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0].duration).toBe(10);
    expect(plan.segments[1].duration).toBe(2);
    expect(plan.segments[1].trimTo).toBe(2);
    expect(plan.total).toBe(12);
    expect(plan.trimmed).toBe(true);
  });

  it("drops later items entirely when earlier videos consume the soundtrack", () => {
    const plan = allocateDurations(8, [vid(10), vid(5), img()]);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].duration).toBe(8);
    expect(plan.segments[0].trimTo).toBe(8);
    expect(plan.trimmed).toBe(true);
  });

  it("freezes the final video frame when videos end before the soundtrack", () => {
    const plan = allocateDurations(20, [vid(6), vid(6)]);
    expect(plan.segments.map((s) => s.duration)).toEqual([6, 14]);
    expect(plan.freezeTail).toBe(8);
    expect(plan.total).toBe(20);
  });

  it("trims videos even when images are present but no time remains", () => {
    const plan = allocateDurations(9, [img(), vid(10), img()]);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].item.kind).toBe("video");
    expect(plan.segments[0].duration).toBe(9);
    expect(plan.trimmed).toBe(true);
  });

  it("absorbs floating-point drift in the final segment (no gap, never longer)", () => {
    // 10s across 3 images = 3.333... each; the last one must absorb the drift.
    const plan = allocateDurations(10, [img(), img(), img()]);
    const total = plan.segments.reduce((s, seg) => s + seg.duration, 0);
    expect(round(total)).toBe(10);
    expect(plan.total).toBe(10);
    expect(total).toBeLessThanOrEqual(10.0005);
  });

  it("keeps totals exact for awkward soundtrack durations", () => {
    for (const dur of [7.1, 13.37, 61.007, 179.999]) {
      const plan = allocateDurations(dur, [img(), vid(3.21), img(), img()]);
      expect(plan.total).toBe(round(dur));
    }
  });
});
