import { describe, expect, it } from "vitest";
import {
  estimateRemainingMs,
  estimateRenderTime,
  formatMs,
  type EstimateInput,
} from "./renderEstimate";

const PIXELS_720 = 1280 * 720;

function input(partial: Partial<EstimateInput>): EstimateInput {
  return {
    soundtrackDuration: 60,
    itemCount: 5,
    videoSourceSeconds: 0,
    outputPixels: PIXELS_720,
    transitionCount: 0,
    zoomedItemCount: 0,
    ...partial,
  };
}

describe("estimateRenderTime", () => {
  it("classifies a small plain project as short", () => {
    const e = estimateRenderTime(input({}));
    expect(e.category).toBe("short");
    expect(e.label).toMatch(/around 5 minutes/);
  });

  it("classifies a long soundtrack as medium/long", () => {
    const e = estimateRenderTime(input({ soundtrackDuration: 6 * 60 }));
    expect(["medium", "long"]).toContain(e.category);
    expect(e.factors).toContain("long soundtrack");
  });

  it("transitions raise the category", () => {
    const plain = estimateRenderTime(input({ soundtrackDuration: 150 }));
    const withFx = estimateRenderTime(
      input({ soundtrackDuration: 150, transitionCount: 6 }),
    );
    expect(plain.category).toBe("short");
    expect(withFx.category).not.toBe("short");
    expect(withFx.factors).toContain("cross-fade transitions");
  });

  it("zoom raises the score and is reported as a factor", () => {
    const e = estimateRenderTime(
      input({ soundtrackDuration: 300, zoomedItemCount: 10 }),
    );
    expect(e.factors).toContain("zoom effects");
  });

  it("an effect-heavy long project lands in long", () => {
    const e = estimateRenderTime(
      input({
        soundtrackDuration: 10 * 60,
        itemCount: 25,
        videoSourceSeconds: 240,
        transitionCount: 20,
        zoomedItemCount: 20,
      }),
    );
    expect(e.category).toBe("long");
    expect(e.label).toMatch(/10–15/);
  });

  it("higher resolution scales the estimate up", () => {
    const hd = estimateRenderTime(
      input({ soundtrackDuration: 240, outputPixels: 1920 * 1080 }),
    );
    expect(hd.factors).toContain("high output resolution");
  });
});

describe("estimateRemainingMs", () => {
  it("returns null before enough real progress exists", () => {
    expect(estimateRemainingMs(5_000, 0.5)).toBeNull(); // too early
    expect(estimateRemainingMs(60_000, 0.05)).toBeNull(); // too little progress
  });

  it("extrapolates linearly once progress is meaningful", () => {
    // 60s elapsed at 50% -> ~60s remaining
    expect(estimateRemainingMs(60_000, 0.5)).toBe(60_000);
  });

  it("never goes negative", () => {
    expect(estimateRemainingMs(60_000, 1)).toBe(0);
  });
});

describe("formatMs", () => {
  it("formats seconds and minutes", () => {
    expect(formatMs(9_000)).toBe("9s");
    expect(formatMs(61_000)).toBe("1m 01s");
    expect(formatMs(600_000)).toBe("10m 00s");
  });
});
