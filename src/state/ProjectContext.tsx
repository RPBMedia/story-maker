import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  initialProjectState,
  projectReducer,
  soundtrackDuration,
  totalUploadedBytes,
  type ProjectAction,
  type ProjectState,
} from "./projectReducer";
import {
  buildTimeline,
  buildTimelineWithCards,
  type CardTimelineInput,
} from "../utils/timeline";
import { loadProject, saveProject } from "../services/projectStore";
import { renderCardImage, buildCardItem } from "../services/cards";
import { ZOOM_LIMITS } from "../types";
import type {
  EffectiveTimeline,
  VisualMediaItem,
  ZoomEffectSettings,
  ZoomEffectType,
} from "../types";

interface ProjectContextValue {
  state: ProjectState;
  dispatch: Dispatch<ProjectAction>;
  /** Derived, always in sync with audio + visual + effect state. */
  soundtrackDuration: number;
  totalBytes: number;
  timeline: EffectiveTimeline;
  isValid: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, initialProjectState);
  // Generated title/end card images, kept out of the reducer (derived from card
  // settings + output size). Regenerated when text or dimensions change.
  const [cardItems, setCardItems] = useState<{
    title?: VisualMediaItem;
    end?: VisualMediaItem;
  }>({});
  // Gate autosave until the initial restore has settled, so we never clobber a
  // saved project by persisting the empty initial state during load.
  const restoredRef = useRef(false);

  // Render the title/end card stills whenever their text (or the output
  // resolution) changes. Failures fall back to no card rather than breaking.
  useEffect(() => {
    let cancelled = false;
    const { width, height } = state.settings;
    // Debounce so typing a title doesn't re-render a canvas on every keystroke.
    const timer = window.setTimeout(() => {
      void (async () => {
        const next: { title?: VisualMediaItem; end?: VisualMediaItem } = {};
        try {
          if (state.titleCard.enabled && state.titleCard.text.trim()) {
            const blob = await renderCardImage(state.titleCard.text, width, height);
            next.title = buildCardItem("title", blob, width, height);
          }
          if (state.endCard.enabled && state.endCard.text.trim()) {
            const blob = await renderCardImage(state.endCard.text, width, height);
            next.end = buildCardItem("end", blob, width, height);
          }
        } catch {
          /* card rendering is best-effort */
        }
        if (cancelled) return;
        setCardItems((prev) => {
          if (prev.title) URL.revokeObjectURL(prev.title.previewUrl);
          if (prev.end) URL.revokeObjectURL(prev.end.previewUrl);
          return next;
        });
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    state.titleCard.enabled,
    state.titleCard.text,
    state.endCard.enabled,
    state.endCard.text,
    state.settings.width,
    state.settings.height,
  ]);

  // Restore any locally-saved project once, on mount.
  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((snap) => {
        if (!cancelled && snap) dispatch({ type: "restore-project", project: snap });
      })
      .finally(() => {
        if (!cancelled) restoredRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave the authoring state (debounced) whenever it changes. Big media
  // blobs are written once; edits only rewrite the tiny metadata snapshot.
  useEffect(() => {
    if (!restoredRef.current) return;
    const id = window.setTimeout(() => {
      void saveProject({
        stage: state.stage,
        audioTracks: state.audioTracks,
        visualItems: state.visualItems,
        orderingMode: state.orderingMode,
        settings: state.settings,
        titleCard: state.titleCard,
        endCard: state.endCard,
        audioCrossfade: state.audioCrossfade,
        audioFade: state.audioFade,
        projectTransition: state.projectTransition,
        projectZoom: state.projectZoom,
        effectOverrides: state.effectOverrides,
      });
    }, 700);
    return () => window.clearTimeout(id);
  }, [
    state.stage,
    state.audioTracks,
    state.visualItems,
    state.orderingMode,
    state.settings,
    state.titleCard,
    state.endCard,
    state.audioCrossfade,
    state.audioFade,
    state.projectTransition,
    state.projectZoom,
    state.effectOverrides,
  ]);

  const value = useMemo<ProjectContextValue>(() => {
    const duration = soundtrackDuration(state);
    const baseInput = {
      soundtrackDuration: duration,
      items: state.visualItems,
      overrides: state.effectOverrides,
      projectTransition: state.projectTransition,
      projectZoom: state.projectZoom,
    };
    const asZoom = (t: ZoomEffectType): ZoomEffectSettings => ({
      type: t,
      amount: ZOOM_LIMITS.default,
    });
    const cards: { title?: CardTimelineInput; end?: CardTimelineInput } = {};
    if (state.titleCard.enabled && cardItems.title) {
      cards.title = {
        item: cardItems.title,
        role: "title",
        durationSeconds: state.titleCard.durationSeconds,
        fade: state.titleCard.fade,
        zoom: asZoom(state.titleCard.zoom),
      };
    }
    if (state.endCard.enabled && cardItems.end) {
      cards.end = {
        item: cardItems.end,
        role: "end",
        durationSeconds: state.endCard.durationSeconds,
        fade: state.endCard.fade,
        zoom: asZoom(state.endCard.zoom),
      };
    }
    const timeline =
      cards.title || cards.end
        ? buildTimelineWithCards(baseInput, cards)
        : buildTimeline(baseInput);
    return {
      state,
      dispatch,
      soundtrackDuration: duration,
      totalBytes: totalUploadedBytes(state),
      timeline,
      isValid: state.audioTracks.length > 0 && state.visualItems.length > 0,
    };
  }, [state, cardItems]);

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
