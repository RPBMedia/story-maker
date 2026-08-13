import { describe, expect, it } from "vitest";
import { aspectPresets, aspectOf } from "./aspect";

describe("aspectPresets", () => {
  it("derives presets from a Free plan cap (1280×720)", () => {
    const byId = Object.fromEntries(
      aspectPresets({ width: 1280, height: 720 }).map((p) => [p.id, p]),
    );
    expect(byId["16:9"]).toMatchObject({ width: 1280, height: 720 });
    expect(byId["9:16"]).toMatchObject({ width: 720, height: 1280 });
    expect(byId["4:5"]).toMatchObject({ width: 1024, height: 1280 });
    expect(byId["1:1"]).toMatchObject({ width: 720, height: 720 });
  });

  it("derives presets from a paid plan cap (1920×1080)", () => {
    const byId = Object.fromEntries(
      aspectPresets({ width: 1920, height: 1080 }).map((p) => [p.id, p]),
    );
    expect(byId["16:9"]).toMatchObject({ width: 1920, height: 1080 });
    expect(byId["9:16"]).toMatchObject({ width: 1080, height: 1920 });
    expect(byId["4:5"]).toMatchObject({ width: 1536, height: 1920 });
    expect(byId["1:1"]).toMatchObject({ width: 1080, height: 1080 });
  });

  it("always yields even dimensions (required for yuv420p)", () => {
    for (const p of aspectPresets({ width: 1366, height: 769 })) {
      expect(p.width % 2).toBe(0);
      expect(p.height % 2).toBe(0);
    }
  });
});

describe("aspectOf", () => {
  it("classifies every ratio, distinguishing 9:16 from 4:5", () => {
    expect(aspectOf({ width: 1920, height: 1080 })).toBe("16:9");
    expect(aspectOf({ width: 1080, height: 1920 })).toBe("9:16");
    expect(aspectOf({ width: 1536, height: 1920 })).toBe("4:5");
    expect(aspectOf({ width: 1080, height: 1080 })).toBe("1:1");
  });
});
