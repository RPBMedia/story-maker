import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useAuth } from "../features/auth/AuthContext";
import { STAGES, type StageId } from "../state/projectReducer";
import { SoundtrackStage } from "../features/audio/SoundtrackStage";
import { MediaStage } from "../features/media/MediaStage";
import { ReviewStage } from "../features/project/ReviewStage";
import { ExportStage } from "../features/rendering/ExportStage";
import { Notices } from "../components/Notices";
import { formatDuration } from "../utils/format";
import { AccountMenu } from "../features/auth/AccountMenu";
import { renderingService } from "../services/rendering/RenderingService";

export function App() {
  const { state, dispatch, soundtrackDuration, isValid } = useProject();
  const { reloadProfile } = useAuth();
  const [checkoutBanner, setCheckoutBanner] = useState<
    "success" | "cancelled" | null
  >(null);

  // Returning from Stripe Checkout: the webhook may take a moment to flip the
  // plan, so re-fetch the profile a few times and show a confirmation banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout !== "success" && checkout !== "cancelled") return;
    setCheckoutBanner(checkout);
    // strip the query param so a refresh doesn't repeat the banner
    window.history.replaceState({}, "", window.location.pathname);
    if (checkout === "success") {
      const timers = [1500, 4000, 8000].map((ms) =>
        window.setTimeout(() => void reloadProfile(), ms),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
  }, [reloadProfile]);

  const done: Record<StageId, boolean> = {
    soundtrack: state.audioTracks.length > 0,
    media: state.visualItems.length > 0,
    review: isValid,
    export: state.renderStatus === "done",
  };
  const stageIndex = STAGES.findIndex((s) => s.id === state.stage);

  /** Clicking the StoryMaker brand returns home to start a fresh project. */
  function startNewProject() {
    const hasContent =
      state.audioTracks.length > 0 || state.visualItems.length > 0;
    if (
      hasContent &&
      !window.confirm(
        "Start a new project? Your current soundtrack, media, and effects will be cleared.",
      )
    ) {
      return;
    }
    renderingService.cancel(); // no-op unless a render is in progress
    dispatch({ type: "reset-project" }); // resets state and returns to Soundtrack
  }

  return (
    <div className="shell">
      {/* Premium Studio ambient backdrop: vignette + drifting glows + grid.
          Purely decorative; fixed behind all content. */}
      <div className="bg-ambient" aria-hidden="true" />
      <header className="topbar">
        <h1 className="topbar__brand">
          <button
            type="button"
            className="topbar__brand-btn"
            onClick={startNewProject}
            title="Start a new project"
          >
            <span className="topbar__logo" aria-hidden="true">
              ▶
            </span>
            StoryMaker
          </button>
        </h1>
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

      {checkoutBanner && (
        <div
          className={`checkout-banner checkout-banner--${checkoutBanner}`}
          role="status"
        >
          <span>
            {checkoutBanner === "success"
              ? "Payment received — thanks! Your plan is activating (this can take a few seconds)."
              : "Checkout cancelled — no charge was made."}
          </span>
          <button
            type="button"
            className="checkout-banner__close"
            aria-label="Dismiss"
            onClick={() => setCheckoutBanner(null)}
          >
            ✕
          </button>
        </div>
      )}

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
