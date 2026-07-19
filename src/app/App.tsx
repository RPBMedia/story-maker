import { useProject } from "../state/ProjectContext";
import { STAGES, type StageId } from "../state/projectReducer";
import { SoundtrackStage } from "../features/audio/SoundtrackStage";
import { MediaStage } from "../features/media/MediaStage";
import { ReviewStage } from "../features/project/ReviewStage";
import { ExportStage } from "../features/rendering/ExportStage";
import { Notices } from "../components/Notices";
import { formatDuration } from "../utils/format";
import { AccountMenu } from "../features/auth/AccountMenu";

export function App() {
  const { state, dispatch, soundtrackDuration, isValid } = useProject();

  const done: Record<StageId, boolean> = {
    soundtrack: state.audioTracks.length > 0,
    media: state.visualItems.length > 0,
    review: isValid,
    export: state.renderStatus === "done",
  };
  const stageIndex = STAGES.findIndex((s) => s.id === state.stage);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            ▶
          </span>
          <h1>StoryMaker</h1>
        </div>
        <div className="topbar__right">
        <div className="topbar__status">
          {state.audioTracks.length > 0 && (
            <span>
              {state.audioTracks.length} track
              {state.audioTracks.length === 1 ? "" : "s"} ·{" "}
              {formatDuration(soundtrackDuration)}
            </span>
          )}
          {state.visualItems.length > 0 && (
            <span>
              {state.visualItems.length} visual
              {state.visualItems.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <AccountMenu />
        </div>
      </header>

      <nav className="stepper" aria-label="Project stages">
        <ol>
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`stepper__step${
                  state.stage === s.id ? " stepper__step--current" : ""
                }${done[s.id] ? " stepper__step--done" : ""}`}
                aria-current={state.stage === s.id ? "step" : undefined}
                onClick={() => dispatch({ type: "go-to-stage", stage: s.id })}
              >
                <span className="stepper__num" aria-hidden="true">
                  {done[s.id] && state.stage !== s.id ? "✓" : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Notices />

      <main className="stage">
        {state.stage === "soundtrack" && <SoundtrackStage />}
        {state.stage === "media" && <MediaStage />}
        {state.stage === "review" && (
          <ReviewStage
            onGenerate={() => dispatch({ type: "go-to-stage", stage: "export" })}
          />
        )}
        {state.stage === "export" && <ExportStage />}
      </main>

      <footer className="stage-footer">
        {stageIndex > 0 && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() =>
              dispatch({ type: "go-to-stage", stage: STAGES[stageIndex - 1].id })
            }
          >
            ← {STAGES[stageIndex - 1].label}
          </button>
        )}
        <span className="stage-footer__spacer" />
        {stageIndex < STAGES.length - 1 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              dispatch({ type: "go-to-stage", stage: STAGES[stageIndex + 1].id })
            }
          >
            {STAGES[stageIndex + 1].label} →
          </button>
        )}
      </footer>
    </div>
  );
}
