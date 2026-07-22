import {
  createContext,
  useContext,
  useMemo,
  useReducer,
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
