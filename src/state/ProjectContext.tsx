import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
import { buildTimeline } from "../utils/timeline";
import { loadProject, saveProject } from "../services/projectStore";
import type { EffectiveTimeline } from "../types";

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
  // Gate autosave until the initial restore has settled, so we never clobber a
  // saved project by persisting the empty initial state during load.
  const restoredRef = useRef(false);

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
    state.projectTransition,
    state.projectZoom,
    state.effectOverrides,
  ]);

  const value = useMemo<ProjectContextValue>(() => {
    const duration = soundtrackDuration(state);
    const timeline = buildTimeline({
      soundtrackDuration: duration,
      items: state.visualItems,
      overrides: state.effectOverrides,
      projectTransition: state.projectTransition,
      projectZoom: state.projectZoom,
    });
    return {
      state,
      dispatch,
      soundtrackDuration: duration,
      totalBytes: totalUploadedBytes(state),
      timeline,
      isValid: state.audioTracks.length > 0 && state.visualItems.length > 0,
    };
  }, [state]);

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
