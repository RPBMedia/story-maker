/** Pure resolvers for the effect-settings inheritance model.
 *
 * Every visual item can carry a nullable override; null/undefined means
 * "use the project default". These helpers are the single source of truth
 * for that inheritance — components and the renderer never re-implement it.
 */
import type {
  TransitionSettings,
  VisualEffectOverrides,
  ZoomEffectSettings,
} from "../types";
import { TRANSITION_LIMITS, ZOOM_LIMITS } from "../types";

export type OverridesByItem = Record<string, VisualEffectOverrides | undefined>;

export function effectiveTransition(
  itemId: string,
  overrides: OverridesByItem,
  projectDefault: TransitionSettings,
): TransitionSettings {
  const o = overrides[itemId]?.transition;
  return o ?? projectDefault;
}

export function effectiveZoom(
  itemId: string,
  overrides: OverridesByItem,
  projectDefault: ZoomEffectSettings,
): ZoomEffectSettings {
  const o = overrides[itemId]?.zoom;
  return clampZoom(o ?? projectDefault);
}

export function clampZoom(z: ZoomEffectSettings): ZoomEffectSettings {
  const amount = Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, z.amount));
  return amount === z.amount ? z : { ...z, amount };
}

export function clampTransitionDuration(duration: number): number {
  return Math.min(
    TRANSITION_LIMITS.max,
    Math.max(TRANSITION_LIMITS.min, duration),
  );
}

/**
 * The overlap a crossfade may actually use at a boundary: never more than
 * maxNeighborFraction of the SHORTER neighboring segment, so a transition can
 * never swallow a segment.
 */
export function safeOverlap(
  requested: number,
  outgoingDuration: number,
  incomingDuration: number,
): number {
  const cap =
    Math.min(outgoingDuration, incomingDuration) *
    TRANSITION_LIMITS.maxNeighborFraction;
  return Math.max(0, Math.min(requested, cap));
}
