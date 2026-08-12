/** Output aspect-ratio presets for the export screen.
 *
 * Dimensions are derived from the current plan's `maxResolution` so the chosen
 * aspect always renders at the best quality that plan allows (e.g. a Free plan
 * capped at 1280×720 gets 720×1280 for portrait; a paid 1920×1080 plan gets
 * 1080×1920). The renderer pads/letterboxes source media to the target canvas,
 * so any source can be exported to any aspect.
 */
import type { RenderSettings } from "../types";

export type AspectRatio = "16:9" | "9:16" | "1:1";

export interface AspectPreset {
  id: AspectRatio;
  /** Short human label for the button. */
  label: string;
  /** Where this shape is used, shown as a sublabel. */
  hint: string;
  width: number;
  height: number;
}

/** Video dimensions must be even for yuv420p H.264. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The three presets sized to a plan's max resolution. The long edge of the
 * plan cap sets the quality; landscape uses it as width, portrait as height,
 * and square uses the short edge for both. */
export function aspectPresets(maxResolution: {
  width: number;
  height: number;
}): AspectPreset[] {
  const long = Math.max(maxResolution.width, maxResolution.height);
  const short = Math.min(maxResolution.width, maxResolution.height);
  return [
    {
      id: "16:9",
      label: "Landscape",
      hint: "16:9 · YouTube, desktop",
      width: even(long),
      height: even((long * 9) / 16),
    },
    {
      id: "9:16",
      label: "Portrait",
      hint: "9:16 · Reels, TikTok, Stories",
      width: even((long * 9) / 16),
      height: even(long),
    },
    {
      id: "1:1",
      label: "Square",
      hint: "1:1 · feed posts",
      width: even(short),
      height: even(short),
    },
  ];
}

/** Classify current render settings into an aspect bucket (for showing which
 * preset is active). */
export function aspectOf(s: Pick<RenderSettings, "width" | "height">): AspectRatio {
  if (s.width === s.height) return "1:1";
  return s.width >= s.height ? "16:9" : "9:16";
}
