import { describe, expect, it } from "vitest";
import { aspectPresets, aspectOf } from "./aspect";

describe("aspectPresets", () => {
  it("derives presets from a Free plan cap (1280×720)", () => {
    const [landscape, portrait, square] = aspectPresets({ width: 1280, height: 720 });
    expect(landscape).toMatchObject({ id: "16:9", width: 1280, height: 720 });
    expect(portrait).toMatchObject({ id: "9:16", width: 720, height: 1280 });
    expect(square).toMatchObject({ id: "1:1", width: 720, height: 720 });
  });

  it("derives presets from a paid plan cap (1920×1080)", () => {
    const [landscape, portrait, square] = aspectPresets({ width: 1920, height: 1080 });
    expect(landscape).toMatchObject({ width: 1920, height: 1080 });
    expect(portrait).toMatchObject({ width: 1080, height: 1920 });
    expect(square).toMatchObject({ width: 1080, height: 1080 });
  });

  it("always yields even dimensions (required for yuv420p)", () => {
    for (const p of aspectPresets({ width: 1366, height: 769 })) {
      expect(p.width % 2).toBe(0);
      expect(p.height % 2).toBe(0);
    }
  });
});

describe("aspectOf", () => {
  it("classifies landscape, portrait, and square", () => {
    expect(aspectOf({ width: 1920, height: 1080 })).toBe("16:9");
    expect(aspectOf({ width: 1080, height: 1920 })).toBe("9:16");
    expect(aspectOf({ width: 1080, height: 1080 })).toBe("1:1");
  });
});
