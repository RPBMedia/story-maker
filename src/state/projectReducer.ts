import type {
  AudioTrack,
  OrderingMode,
  RenderError,
  RenderProgress,
  RenderResult,
  RenderSettings,
  RenderStatus,
  TransitionSettings,
  VisualEffectOverrides,
  VisualMediaItem,
  ZoomEffectSettings,
} from "../types";
import {
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_TRANSITION,
  DEFAULT_ZOOM,
} from "../types";

export type StageId = "soundtrack" | "media" | "review" | "export";

export const STAGES: { id: StageId; label: string }[] = [
  { id: "soundtrack", label: "Soundtrack" },
  { id: "media", label: "Visual media" },
  { id: "review", label: "Review" },
  { id: "export", label: "Export" },
];

/** One level of undo for automatic ordering: the sequence and mode that were
 * in effect immediately BEFORE the last sort/shuffle. */
export interface OrderSnapshot {
  items: VisualMediaItem[];
  mode: OrderingMode;
}

export interface ProjectState {
  stage: StageId;
  audioTracks: AudioTrack[];
  visualItems: VisualMediaItem[];
  /** How the current visual sequence was ordered. */
  orderingMode: OrderingMode;
  /** Snapshot enabling a single Undo of the last automatic ordering; null when
   * there is nothing to undo (e.g. after a manual drag or an upload). */
  orderSnapshot: OrderSnapshot | null;
  settings: RenderSettings;
  /** Project-wide effect defaults; items may override (null = inherit). */
  projectTransition: TransitionSettings;
  projectZoom: ZoomEffectSettings;
  effectOverrides: Record<string, VisualEffectOverrides | undefined>;
  /** True once the pre-render confirmation was accepted for the current
   * configuration; cleared when the configuration changes. */
  exportConfirmed: boolean;
  renderStatus: RenderStatus;
  renderProgress: RenderProgress;
  result: RenderResult | null;
  error: RenderError | null;
  /** Non-blocking notices (rejected files, duplicates). */
  notices: string[];
}

export const initialProjectState: ProjectState = {
  stage: "soundtrack",
  audioTracks: [],
  visualItems: [],
  orderingMode: "manual",
  orderSnapshot: null,
  settings: DEFAULT_RENDER_SETTINGS,
  projectTransition: DEFAULT_TRANSITION,
  projectZoom: DEFAULT_ZOOM,
  effectOverrides: {},
  exportConfirmed: false,
  renderStatus: "idle",
  renderProgress: { stage: "idle", overall: 0 },
  result: null,
  error: null,
  notices: [],
};

export type ProjectAction =
  | { type: "go-to-stage"; stage: StageId }
  | { type: "add-audio"; tracks: AudioTrack[] }
  | { type: "remove-audio"; id: string }
  | { type: "reorder-audio"; from: number; to: number }
  | { type: "add-visual"; items: VisualMediaItem[] }
  | { type: "remove-visual"; id: string }
  | { type: "reorder-visual"; from: number; to: number }
  /** Replace the whole sequence with a pre-computed automatic ordering
   * (sort or shuffle). `items` must be a re-ordering of the current items. */
  | { type: "set-ordering"; mode: OrderingMode; items: VisualMediaItem[] }
  | { type: "undo-ordering" }
  | { type: "set-project-transition"; transition: TransitionSettings }
  | { type: "set-project-zoom"; zoom: ZoomEffectSettings }
  | { type: "set-item-transition"; id: string; transition: TransitionSettings | null }
  | { type: "set-item-zoom"; id: string; zoom: ZoomEffectSettings | null }
  | { type: "confirm-export" }
  | { type: "add-notices"; notices: string[] }
  | { type: "dismiss-notices" }
  | { type: "render-started" }
  | { type: "render-progress"; progress: RenderProgress }
  | { type: "render-succeeded"; result: RenderResult }
  | { type: "render-failed"; error: RenderError }
  | { type: "render-cancelled" }
  | { type: "clear-result" }
  | { type: "reset-project" };

function move<T>(arr: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= arr.length ||
    to >= arr.length
  ) {
    return arr;
  }
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function soundtrackDuration(state: ProjectState): number {
  return state.audioTracks.reduce((s, t) => s + t.duration, 0);
}

export function totalUploadedBytes(state: ProjectState): number {
  return (
    state.audioTracks.reduce((s, t) => s + t.size, 0) +
    state.visualItems.reduce((s, i) => s + i.size, 0)
  );
}

export function projectReducer(
  state: ProjectState,
  action: ProjectAction,
): ProjectState {
  switch (action.type) {
    case "go-to-stage":
      return { ...state, stage: action.stage };

    case "add-audio":
      return {
        ...state,
        exportConfirmed: false,
        audioTracks: [...state.audioTracks, ...action.tracks],
      };

    case "remove-audio": {
      const track = state.audioTracks.find((t) => t.id === action.id);
      if (track) URL.revokeObjectURL(track.previewUrl);
      return {
        ...state,
        exportConfirmed: false,
        audioTracks: state.audioTracks.filter((t) => t.id !== action.id),
      };
    }

    case "reorder-audio": {
      const moved = move(state.audioTracks, action.from, action.to);
      return moved === state.audioTracks ? state : { ...state, audioTracks: moved };
    }

    case "add-visual":
      // New uploads append and reset ordering to Manual — existing media is
      // never silently re-sorted, and the previous undo point is discarded.
      return {
        ...state,
        exportConfirmed: false,
        visualItems: [...state.visualItems, ...action.items],
        orderingMode: "manual",
        orderSnapshot: null,
      };

    case "remove-visual": {
      const item = state.visualItems.find((i) => i.id === action.id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      // A removal invalidates any pending undo (its snapshot references the
      // removed item); the ordering mode itself still holds for what remains.
      return {
        ...state,
        exportConfirmed: false,
        visualItems: state.visualItems.filter((i) => i.id !== action.id),
        orderSnapshot: null,
      };
    }

    case "reorder-visual": {
      const moved = move(state.visualItems, action.from, action.to);
      if (moved === state.visualItems) return state;
      // A manual drag/move switches the mode to Manual and stops automatic
      // sorting; the last automatic-ordering undo point is cleared.
      return {
        ...state,
        exportConfirmed: false,
        visualItems: moved,
        orderingMode: "manual",
        orderSnapshot: null,
      };
    }

    case "set-ordering": {
      // Store the resulting order verbatim (the renderer uses it as-is) and
      // capture the prior order+mode so a single Undo can restore it exactly.
      return {
        ...state,
        exportConfirmed: false,
        visualItems: action.items,
        orderingMode: action.mode,
        orderSnapshot: {
          items: state.visualItems,
          mode: state.orderingMode,
        },
      };
    }

    case "undo-ordering": {
      if (!state.orderSnapshot) return state;
      return {
        ...state,
        exportConfirmed: false,
        visualItems: state.orderSnapshot.items,
        orderingMode: state.orderSnapshot.mode,
        orderSnapshot: null,
      };
    }

    case "set-project-transition":
      return {
        ...state,
        projectTransition: action.transition,
        exportConfirmed: false,
      };

    case "set-project-zoom":
      return { ...state, projectZoom: action.zoom, exportConfirmed: false };

    case "set-item-transition":
      return {
        ...state,
        exportConfirmed: false,
        effectOverrides: {
          ...state.effectOverrides,
          [action.id]: {
            ...state.effectOverrides[action.id],
            transition: action.transition,
          },
        },
      };

    case "set-item-zoom":
      return {
        ...state,
        exportConfirmed: false,
        effectOverrides: {
          ...state.effectOverrides,
          [action.id]: {
            ...state.effectOverrides[action.id],
            zoom: action.zoom,
          },
        },
      };

    case "confirm-export":
      return { ...state, exportConfirmed: true };

    case "add-notices":
      return { ...state, notices: [...state.notices, ...action.notices] };

    case "dismiss-notices":
      return { ...state, notices: [] };

    case "render-started":
      if (state.renderStatus === "rendering") return state; // no duplicates
      if (state.result) URL.revokeObjectURL(state.result.url); // stale output
      return {
        ...state,
        renderStatus: "rendering",
        renderProgress: { stage: "loading-engine", overall: 0 },
        result: null,
        error: null,
      };

    case "render-progress":
      if (state.renderStatus !== "rendering") return state;
      return { ...state, renderProgress: action.progress };

    case "render-succeeded":
      return {
        ...state,
        renderStatus: "done",
        renderProgress: { stage: "finalizing", overall: 1 },
        result: action.result,
        error: null,
      };

    case "render-failed":
      return {
        ...state,
        renderStatus: "error",
        renderProgress: { stage: "idle", overall: 0 },
        error: action.error,
      };

    case "render-cancelled":
      return {
        ...state,
        renderStatus: "cancelled",
        renderProgress: { stage: "idle", overall: 0 },
      };

    case "clear-result":
      if (state.result) URL.revokeObjectURL(state.result.url);
      return { ...state, result: null, renderStatus: "idle" };

    case "reset-project": {
      for (const t of state.audioTracks) URL.revokeObjectURL(t.previewUrl);
      for (const i of state.visualItems) URL.revokeObjectURL(i.previewUrl);
      if (state.result) URL.revokeObjectURL(state.result.url);
      return { ...initialProjectState };
    }

    default:
      return state;
  }
}
