import { useEffect } from "react";
import { useProject } from "../../state/ProjectContext";
import { formatBytes, formatDuration, formatSeconds } from "../../utils/format";
import { EffectsPanel } from "./EffectsPanel";
import { RenderTimeInfo } from "../../components/RenderTimeInfo";
import {
  estimateInputFromTimeline,
  estimateRenderTime,
} from "../../utils/renderEstimate";
import { analytics } from "../../services/analytics";

/** Soft thresholds that trigger warnings, never blocks. */
const LARGE_PROJECT_BYTES = 500 * 1024 * 1024; // 500 MB
const LONG_SOUNDTRACK_SECONDS = 10 * 60; // 10 min

export function ReviewStage({ onGenerate }: { onGenerate: () => void }) {
  const { state, timeline, soundtrackDuration, totalBytes, isValid } =
    useProject();
  const images = state.visualItems.filter((i) => i.kind === "image");
  const videos = state.visualItems.filter((i) => i.kind === "video");

  const estimate =
    timeline.segments.length > 0
      ? estimateRenderTime(
          estimateInputFromTimeline(
            soundtrackDuration,
            timeline,
            state.settings.width * state.settings.height,
          ),
        )
      : null;

  useEffect(() => {
    if (estimate) {
      analytics.track("render_time_estimate_viewed", {
        category: estimate.category,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate?.category]);

  const activeTransitions = timeline.boundaries.filter(
    (b) => b.type !== "none" && b.overlap > 0,
  ).length;
  const zoomedItems = timeline.segments.filter(
    (s) => s.zoom.type !== "none",
  ).length;

  const warnings: string[] = [];
  if (totalBytes > LARGE_PROJECT_BYTES) {
    warnings.push(
      `Your media adds up to ${formatBytes(totalBytes)}. Browser rendering keeps everything in memory — very large projects can fail on machines with limited RAM.`,
    );
  }
  if (soundtrackDuration > LONG_SOUNDTRACK_SECONDS) {
    warnings.push(
      `The soundtrack is ${formatDuration(soundtrackDuration)} long. Rendering happens at roughly real-time speed or slower in the browser, so expect a long wait.`,
    );
  }
  if (timeline.trimmed) {
    warnings.push(
      "Your video clips are longer than the soundtrack — the visual sequence will be cut when the audio ends.",
    );
  }
  if (timeline.freezeTail > 0) {
    warnings.push(
      `The last clip's final frame will hold for ${formatSeconds(timeline.freezeTail)} so the picture lasts until the audio ends.`,
    );
  }
  if (timeline.anyClamped) {
    warnings.push(
      "Some cross-fades were shortened automatically because neighboring items are too brief for the requested duration.",
    );
  }

  const blockers: string[] = [];
  if (state.audioTracks.length === 0) blockers.push("Add at least one audio track.");
  if (state.visualItems.length === 0) blockers.push("Add at least one image or video.");

  return (
    <section aria-labelledby="review-title">
      <header className="stage-header">
        <div>
          <h2 id="review-title">Review</h2>
          <p className="stage-sub">
            A last look at your project before rendering.
          </p>
        </div>
      </header>

      <dl className="summary-grid">
        <div className="summary-cell">
          <dt>Audio tracks</dt>
          <dd>{state.audioTracks.length}</dd>
        </div>
        <div className="summary-cell">
          <dt>Soundtrack</dt>
          <dd>{formatDuration(soundtrackDuration)}</dd>
        </div>
        <div className="summary-cell">
          <dt>Images</dt>
          <dd>{images.length}</dd>
        </div>
        <div className="summary-cell">
          <dt>Video clips</dt>
          <dd>{videos.length}</dd>
        </div>
        <div className="summary-cell">
          <dt>Uploaded size</dt>
          <dd>{formatBytes(totalBytes)}</dd>
        </div>
        <div className="summary-cell">
          <dt>Output duration</dt>
          <dd>{formatDuration(timeline.total)}</dd>
        </div>
        <div className="summary-cell">
          <dt>Resolution</dt>
          <dd>
            {state.settings.width}×{state.settings.height}
          </dd>
        </div>
        <div className="summary-cell">
          <dt>Frame rate</dt>
          <dd>{state.settings.fps} fps</dd>
        </div>
        <div className="summary-cell">
          <dt>Cross-fades</dt>
          <dd>{activeTransitions}</dd>
        </div>
        <div className="summary-cell">
          <dt>Zoomed items</dt>
          <dd>{zoomedItems}</dd>
        </div>
      </dl>

      <EffectsPanel />

      {timeline.segments.length > 0 && (
        <>
          <h3 className="section-title">Sequence</h3>
          <div
            className="sequence-bar"
            role="img"
            aria-label={`Sequence of ${timeline.segments.length} segments${activeTransitions > 0 ? ` with ${activeTransitions} cross-fades` : ""}`}
          >
            {timeline.segments.map((s, i) => {
              const boundary = timeline.boundaries.find(
                (b) => b.afterIndex === i,
              );
              return (
                <div
                  key={s.item.id}
                  className={`sequence-bar__wrap${
                    boundary && boundary.type === "crossfade" && boundary.overlap > 0
                      ? " sequence-bar__wrap--fade"
                      : ""
                  }`}
                  style={{ flexGrow: Math.max(s.duration, 0.2) }}
                >
                  <div
                    className={`sequence-bar__seg sequence-bar__seg--${s.item.kind}`}
                    title={`${s.item.name} — ${formatSeconds(s.duration)}${
                      s.zoom.type !== "none" ? ` · ${s.zoom.type}` : ""
                    }`}
                  >
                    <span className="sequence-bar__label">
                      {s.item.kind === "image" ? "IMG" : "VID"}
                      {s.zoom.type === "zoom-in" && " ⊕"}
                      {s.zoom.type === "zoom-out" && " ⊖"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="sequence-legend">
            <span className="chip chip--image">Image</span>{" "}
            <span className="chip chip--video">Video</span> — width is
            proportional to time; ⊕/⊖ mark zoom in/out; the fade mark between
            blocks shows a cross-fade. The editor preview is indicative — the
            exported video is rendered by FFmpeg.
          </p>
        </>
      )}

      <RenderTimeInfo estimate={estimate} />

      {blockers.length > 0 && (
        <div className="blockers" role="alert">
          <strong>Before you can generate:</strong>
          <ul>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="warnings" role="note">
          <strong>Worth knowing:</strong>
          <ul>
            {warnings.map((wn) => (
              <li key={wn}>{wn}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="stage-actions">
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={!isValid}
          onClick={onGenerate}
        >
          Generate Video
        </button>
        <p className="stage-sub" style={{ marginTop: 8 }}>
          Takes several minutes — you'll confirm on the next step.
        </p>
      </div>
    </section>
  );
}
