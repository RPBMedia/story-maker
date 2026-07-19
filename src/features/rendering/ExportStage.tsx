import { useState } from "react";
import { useProject } from "../../state/ProjectContext";
import {
  renderingService,
  RenderCancelledError,
  RenderFailedError,
} from "../../services/rendering/RenderingService";
import { RENDER_STAGE_LABELS } from "../../types";
import { formatBytes, formatDuration } from "../../utils/format";

export function ExportStage() {
  const { state, dispatch, plan, soundtrackDuration, isValid } = useProject();
  const [detailOpen, setDetailOpen] = useState(false);
  const { renderStatus, renderProgress, result, error } = state;
  const rendering = renderStatus === "rendering";

  async function generate() {
    if (rendering || !isValid) return;
    dispatch({ type: "render-started" });
    try {
      const res = await renderingService.render({
        audioTracks: state.audioTracks,
        plan,
        soundtrackDuration,
        settings: state.settings,
        onProgress: (progress) =>
          dispatch({ type: "render-progress", progress }),
      });
      dispatch({ type: "render-succeeded", result: res });
    } catch (e) {
      if (e instanceof RenderCancelledError) {
        dispatch({ type: "render-cancelled" });
        return;
      }
      dispatch({
        type: "render-failed",
        error: {
          message:
            e instanceof RenderFailedError
              ? e.message
              : "Rendering failed unexpectedly.",
          detail: e instanceof RenderFailedError ? e.detail : String(e),
          projectIntact: true,
        },
      });
    }
  }

  function resetProject() {
    const hasContent =
      state.audioTracks.length > 0 || state.visualItems.length > 0;
    if (
      hasContent &&
      !window.confirm(
        "Reset the project? All uploaded tracks and media will be removed from this session.",
      )
    ) {
      return;
    }
    renderingService.cancel();
    dispatch({ type: "reset-project" });
  }

  const pct = Math.round(renderProgress.overall * 100);

  return (
    <section aria-labelledby="export-title">
      <header className="stage-header">
        <div>
          <h2 id="export-title">Export</h2>
          <p className="stage-sub">
            Rendering happens entirely in your browser — nothing is uploaded
            anywhere.
          </p>
        </div>
      </header>

      {!rendering && !result && (
        <div className="export-launch">
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={!isValid}
            onClick={generate}
          >
            Generate Video
          </button>
          {!isValid && (
            <p className="warning-inline" role="note">
              Add at least one audio track and one visual item first.
            </p>
          )}
        </div>
      )}

      {rendering && (
        <div className="render-progress" role="status" aria-live="polite">
          <div className="render-progress__head">
            <span className="render-progress__stage">
              {RENDER_STAGE_LABELS[renderProgress.stage]}
            </span>
            <span className="render-progress__pct">{pct}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="render-progress__hint">
            Keep this tab open. Rendering long projects can take a while.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => renderingService.cancel()}
          >
            Cancel render
          </button>
        </div>
      )}

      {renderStatus === "cancelled" && !rendering && (
        <div className="warnings" role="note">
          <strong>Render cancelled.</strong> Your project is untouched — you
          can generate again whenever you're ready.
        </div>
      )}

      {error && renderStatus === "error" && (
        <div className="blockers" role="alert">
          <strong>{error.message}</strong>
          <p>
            {error.projectIntact
              ? "Your uploaded project is still intact. You can adjust it or simply try again."
              : "Please re-check your uploaded files."}
          </p>
          {error.detail && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDetailOpen((v) => !v)}
              >
                {detailOpen ? "Hide" : "Show"} technical details
              </button>
              {detailOpen && <pre className="error-detail">{error.detail}</pre>}
            </>
          )}
        </div>
      )}

      {result && (
        <div className="result">
          <video
            className="result__player"
            src={result.url}
            controls
            playsInline
            aria-label="Generated video preview"
          />
          <div className="result__meta">
            <span>
              <strong>{formatDuration(result.duration)}</strong> ·{" "}
              {formatBytes(result.size)} · MP4 (H.264/AAC)
            </span>
          </div>
          <div className="result__actions">
            <a
              className="btn btn--primary btn--large"
              href={result.url}
              download="storymaker.mp4"
            >
              Download MP4
            </a>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={generate}
            >
              Render again
            </button>
          </div>
        </div>
      )}

      <div className="stage-actions stage-actions--footer">
        <button type="button" className="btn btn--ghost" onClick={resetProject}>
          Reset project
        </button>
      </div>
    </section>
  );
}
