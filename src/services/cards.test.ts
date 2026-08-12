import { describe, expect, it } from "vitest";
import { wrapText } from "./cards";
import { fadeInChain, fadeOutChain } from "./rendering/filters";

// Each character is 10px wide in this fake measurer.
const measure = (s: string) => s.length * 10;

describe("wrapText", () => {
  it("greedily wraps words to fit the max width", () => {
    expect(wrapText("hello world foo", 100, measure)).toEqual(["hello", "world foo"]);
  });

  it("keeps a single over-long word on its own line", () => {
    expect(wrapText("supercalifragilistic ok", 80, measure)).toEqual([
      "supercalifragilistic",
      "ok",
    ]);
  });

  it("preserves explicit line breaks", () => {
    expect(wrapText("line one\nline two", 1000, measure)).toEqual([
      "line one",
      "line two",
    ]);
  });
});

describe("card fade filters", () => {
  it("fadeInChain starts at 0 and fades from black", () => {
    expect(fadeInChain(0.8)).toBe("fade=t=in:st=0:d=0.800:color=black");
    expect(fadeInChain(0)).toBeNull();
  });

  it("fadeOutChain ends near the segment tail", () => {
    const chain = fadeOutChain(0.8, 3, 30);
    expect(chain).toMatch(/^fade=t=out:st=\d/);
    expect(chain).toContain("color=black");
  });
});
