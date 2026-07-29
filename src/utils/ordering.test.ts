import { describe, expect, it } from "vitest";
import {
  fisherYatesShuffle,
  naturalCompare,
  shuffleDistinct,
  sortVisualItems,
} from "./ordering";
import type { ImageMediaItem, VisualMediaItem } from "../types";

/** Minimal image item; only the fields ordering reads need to be meaningful. */
function item(
  id: string,
  name: string,
  createdAt: number,
): ImageMediaItem {
  return {
    id,
    kind: "image",
    file: new File([], name),
    name,
    size: 1,
    previewUrl: "",
    width: 1,
    height: 1,
    createdAt,
    dateSource: "upload-time",
  };
}

const ids = (items: VisualMediaItem[]) => items.map((i) => i.id);

/** Deterministic PRNG (mulberry32) for repeatable shuffle assertions. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("naturalCompare", () => {
  it("orders embedded numbers by value, not lexically", () => {
    const names = ["IMG_10", "IMG_2", "IMG_1", "IMG_9"];
    const sorted = names.slice().sort(naturalCompare);
    expect(sorted).toEqual(["IMG_1", "IMG_2", "IMG_9", "IMG_10"]);
  });

  it("is case-insensitive", () => {
    expect(naturalCompare("apple", "Banana")).toBeLessThan(0);
    expect(naturalCompare("Banana", "apple")).toBeGreaterThan(0);
    // case-only difference sorts deterministically, never as equal
    expect(naturalCompare("a", "A")).not.toBe(0);
  });

  it("handles multiple numeric groups", () => {
    const names = ["s2e10", "s2e2", "s10e1", "s1e1"];
    expect(names.slice().sort(naturalCompare)).toEqual([
      "s1e1",
      "s2e2",
      "s2e10",
      "s10e1",
    ]);
  });
});

describe("sortVisualItems", () => {
  const a = item("a", "IMG_2.jpg", 300);
  const b = item("b", "IMG_10.jpg", 100);
  const c = item("c", "IMG_1.jpg", 200);
  const seq = [a, b, c];

  it("sorts oldest first (creation date ascending)", () => {
    expect(ids(sortVisualItems(seq, "date-asc"))).toEqual(["b", "c", "a"]);
  });

  it("sorts newest first (creation date descending)", () => {
    expect(ids(sortVisualItems(seq, "date-desc"))).toEqual(["a", "c", "b"]);
  });

  it("sorts filename A→Z with natural ordering", () => {
    expect(ids(sortVisualItems(seq, "name-asc"))).toEqual(["c", "a", "b"]);
  });

  it("sorts filename Z→A", () => {
    expect(ids(sortVisualItems(seq, "name-desc"))).toEqual(["b", "a", "c"]);
  });

  it("manual returns a copy in the same order", () => {
    const out = sortVisualItems(seq, "manual");
    expect(out).not.toBe(seq);
    expect(ids(out)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const before = ids(seq);
    sortVisualItems(seq, "date-desc");
    expect(ids(seq)).toEqual(before);
  });

  it("is stable for equal keys", () => {
    // Three items sharing a timestamp keep their original relative order.
    const x = item("x", "z.jpg", 500);
    const y = item("y", "m.jpg", 500);
    const z = item("z", "a.jpg", 500);
    expect(ids(sortVisualItems([x, y, z], "date-asc"))).toEqual([
      "x",
      "y",
      "z",
    ]);
  });
});

describe("fisherYatesShuffle", () => {
  it("preserves the exact multiset of items (a permutation)", () => {
    const seq = Array.from({ length: 50 }, (_, i) =>
      item(`n${i}`, `f${i}`, i),
    );
    const out = fisherYatesShuffle(seq, seeded(123));
    expect(out).toHaveLength(seq.length);
    expect(ids(out).sort()).toEqual(ids(seq).sort());
  });

  it("is deterministic for a given RNG stream", () => {
    const seq = Array.from({ length: 20 }, (_, i) => item(`n${i}`, `f${i}`, i));
    expect(ids(fisherYatesShuffle(seq, seeded(7)))).toEqual(
      ids(fisherYatesShuffle(seq, seeded(7))),
    );
  });

  it("does not mutate the input", () => {
    const seq = [item("a", "a", 1), item("b", "b", 2), item("c", "c", 3)];
    const before = ids(seq);
    fisherYatesShuffle(seq, seeded(1));
    expect(ids(seq)).toEqual(before);
  });
});

describe("shuffleDistinct", () => {
  const seq = Array.from({ length: 8 }, (_, i) => item(`n${i}`, `f${i}`, i));

  it("preserves every item id", () => {
    const out = shuffleDistinct(seq, seeded(42));
    expect(ids(out).sort()).toEqual(ids(seq).sort());
  });

  it("changes the render order (never returns the current order)", () => {
    // Try many seeds — every result must differ from the input order.
    for (let s = 1; s <= 200; s++) {
      const out = shuffleDistinct(seq, seeded(s));
      expect(ids(out)).not.toEqual(ids(seq));
    }
  });

  it("falls back to a two-item swap when shuffles keep matching", () => {
    // An RNG that returns ~1 makes Fisher-Yates yield the identity order every
    // attempt, forcing the guaranteed-distinct swap fallback.
    const out = shuffleDistinct(seq, () => 0.999999);
    expect(ids(out)).not.toEqual(ids(seq));
    // first two swapped, the rest identical
    expect(ids(out).slice(0, 2)).toEqual(["n1", "n0"]);
    expect(ids(out).slice(2)).toEqual(ids(seq).slice(2));
  });

  it("returns a copy unchanged for 0- or 1-item sequences", () => {
    expect(shuffleDistinct([])).toEqual([]);
    const one = [item("solo", "solo", 1)];
    const out = shuffleDistinct(one);
    expect(out).not.toBe(one);
    expect(ids(out)).toEqual(["solo"]);
  });
});
