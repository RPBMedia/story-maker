/**
 * Pure ordering primitives for the single combined image+video sequence.
 *
 * These functions never mutate their input and never touch React or project
 * state — they take an array of items and return a NEW array of the SAME item
 * references in a new order. Because callers only reorder existing references
 * (never clone media, blobs, or effect settings), per-item zoom/transition —
 * which live in an id-keyed map — travel with each item automatically.
 */
import type {
  OrderingMode,
  SortOrderingMode,
  VisualMediaItem,
} from "../types";

/** Human labels for the Sort dropdown (Shuffled is a separate control). */
export const SORT_MODE_LABELS: Record<SortOrderingMode, string> = {
  manual: "Manual",
  "date-asc": "Oldest first",
  "date-desc": "Newest first",
  "name-asc": "Filename (A→Z)",
  "name-desc": "Filename (Z→A)",
};

/** Dropdown option order. */
export const SORT_MODES: SortOrderingMode[] = [
  "manual",
  "date-asc",
  "date-desc",
  "name-asc",
  "name-desc",
];

export function isAutomaticMode(mode: OrderingMode): boolean {
  return mode !== "manual";
}

/**
 * Case-insensitive natural comparison: embedded digit runs compare by numeric
 * value, so "IMG_2" < "IMG_10" < "IMG_9" is avoided — the result is
 * IMG_1 < IMG_2 < IMG_9 < IMG_10. Non-digit runs compare lexicographically
 * (locale-aware). Ties fall back to a case-sensitive compare so distinct names
 * never compare fully equal (keeps sorts deterministic).
 */
export function naturalCompare(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const digits = /(\d+)/;
  // Split each string into alternating non-digit / digit chunks.
  const at = al.split(digits);
  const bt = bl.split(digits);
  const len = Math.min(at.length, bt.length);
  for (let i = 0; i < len; i++) {
    const ac = at[i];
    const bc = bt[i];
    if (ac === bc) continue;
    // Odd indices are digit runs (from the capturing split).
    const bothNumeric = i % 2 === 1;
    if (bothNumeric) {
      const an = Number(ac);
      const bn = Number(bc);
      if (an !== bn) return an - bn;
      // Equal numeric value but different text (leading zeros): shorter first.
      if (ac.length !== bc.length) return ac.length - bc.length;
    } else {
      if (ac < bc) return -1;
      if (ac > bc) return 1;
    }
  }
  if (at.length !== bt.length) return at.length - bt.length;
  // Case-only difference: stable, deterministic tiebreak.
  return a < b ? -1 : a > b ? 1 : 0;
}

type Comparator = (a: VisualMediaItem, b: VisualMediaItem) => number;

function comparatorFor(mode: SortOrderingMode): Comparator | null {
  switch (mode) {
    case "date-asc":
      return (a, b) => a.createdAt - b.createdAt;
    case "date-desc":
      return (a, b) => b.createdAt - a.createdAt;
    case "name-asc":
      return (a, b) => naturalCompare(a.name, b.name);
    case "name-desc":
      return (a, b) => naturalCompare(b.name, a.name);
    case "manual":
      return null; // manual: keep existing order
  }
}

/**
 * Return a new array sorted by `mode`. Sorting is STABLE even for keys that tie
 * (e.g. two files with the same capture second): items keep their prior
 * relative order. `manual` returns a shallow copy unchanged.
 */
export function sortVisualItems(
  items: VisualMediaItem[],
  mode: SortOrderingMode,
): VisualMediaItem[] {
  const cmp = comparatorFor(mode);
  if (!cmp) return items.slice();
  // Decorate with original index to guarantee stability regardless of the
  // engine's Array.prototype.sort stability.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const c = cmp(a.item, b.item);
      return c !== 0 ? c : a.index - b.index;
    })
    .map((d) => d.item);
}

// ---- shuffle ----------------------------------------------------------------

type Rng = () => number;

/**
 * Fisher-Yates (Durstenfeld) shuffle. Returns a NEW array; input untouched.
 * Uses an unbiased backward pass — never `Array.sort(() => Math.random())`,
 * which is biased and can violate comparator contracts.
 */
export function fisherYatesShuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function sameOrder(a: VisualMediaItem[], b: VisualMediaItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

/**
 * Shuffle that avoids returning the current order. Reshuffles a few times; if
 * every attempt still matches (statistically unlikely, or forced with a
 * degenerate RNG), it swaps two items as a guaranteed-distinct fallback.
 *
 * Preserves every item reference (and therefore every id, zoom, and transition
 * setting). For 0- or 1-item sequences a distinct order is impossible, so the
 * input order is returned as-is (a copy).
 */
export function shuffleDistinct(
  items: VisualMediaItem[],
  rng: Rng = Math.random,
): VisualMediaItem[] {
  if (items.length < 2) return items.slice();
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = fisherYatesShuffle(items, rng);
    if (!sameOrder(candidate, items)) return candidate;
  }
  // Final deterministic fallback: swap the first two items.
  const out = items.slice();
  const tmp = out[0];
  out[0] = out[1];
  out[1] = tmp;
  return out;
}
