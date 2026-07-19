/** Project-wide Visual Effects defaults: transition + subtle zoom. */
import { useProject } from "../../state/ProjectContext";
import { analytics } from "../../services/analytics";
import {
  TRANSITION_LIMITS,
  ZOOM_LIMITS,
  type TransitionType,
  type ZoomEffectType,
} from "../../types";

export function EffectsPanel() {
  const { state, dispatch, timeline } = useProject();
  const t = state.projectTransition;
  const z = state.projectZoom;

  function setTransitionType(type: TransitionType) {
    dispatch({
      type: "set-project-transition",
      transition: { ...t, type },
    });
    if (type !== "none") analytics.track("transition_enabled", { scope: "project" });
  }

  function setZoomType(type: ZoomEffectType) {
    dispatch({ type: "set-project-zoom", zoom: { ...z, type } });
    if (type !== "none") analytics.track("zoom_enabled", { scope: "project" });
  }

  return (
    <section className="effects-panel card" aria-labelledby="effects-title">
      <h3 id="effects-title" className="section-title">
        Visual effects
      </h3>
      <p className="stage-sub">
        Project-wide defaults. Individual items can override these from their
        card in the Visual media step.
      </p>

      <div className="effects-grid">
        <div className="effects-field">
          <span className="effects-label" id="transition-label">
            Transition
          </span>
          <div
            className="segmented"
            role="group"
            aria-labelledby="transition-label"
          >
            <button
              type="button"
              className={`segmented__btn${t.type === "none" ? " segmented__btn--on" : ""}`}
              aria-pressed={t.type === "none"}
              onClick={() => setTransitionType("none")}
            >
              None
            </button>
            <button
              type="button"
              className={`segmented__btn${t.type === "crossfade" ? " segmented__btn--on" : ""}`}
              aria-pressed={t.type === "crossfade"}
              onClick={() => setTransitionType("crossfade")}
            >
              Cross-fade
            </button>
          </div>
        </div>

        {t.type === "crossfade" && (
          <div className="effects-field">
            <label className="effects-label" htmlFor="transition-duration">
              Cross-fade duration:{" "}
              <strong>{t.duration.toFixed(2)}s</strong>
            </label>
            <input
              id="transition-duration"
              type="range"
              min={TRANSITION_LIMITS.min}
              max={TRANSITION_LIMITS.max}
              step={TRANSITION_LIMITS.step}
              value={t.duration}
              onChange={(e) =>
                dispatch({
                  type: "set-project-transition",
                  transition: { ...t, duration: Number(e.target.value) },
                })
              }
            />
          </div>
        )}

        <div className="effects-field">
          <span className="effects-label" id="zoom-label">
            Subtle zoom
          </span>
          <div className="segmented" role="group" aria-labelledby="zoom-label">
            <button
              type="button"
              className={`segmented__btn${z.type === "none" ? " segmented__btn--on" : ""}`}
              aria-pressed={z.type === "none"}
              onClick={() => setZoomType("none")}
            >
              Off
            </button>
            <button
              type="button"
              className={`segmented__btn${z.type === "zoom-in" ? " segmented__btn--on" : ""}`}
              aria-pressed={z.type === "zoom-in"}
              onClick={() => setZoomType("zoom-in")}
            >
              Zoom in
            </button>
            <button
              type="button"
              className={`segmented__btn${z.type === "zoom-out" ? " segmented__btn--on" : ""}`}
              aria-pressed={z.type === "zoom-out"}
              onClick={() => setZoomType("zoom-out")}
            >
              Zoom out
            </button>
          </div>
        </div>

        {z.type !== "none" && (
          <div className="effects-field">
            <label className="effects-label" htmlFor="zoom-amount">
              Zoom amount: <strong>{Math.round((z.amount - 1) * 100)}%</strong>
            </label>
            <input
              id="zoom-amount"
              type="range"
              min={ZOOM_LIMITS.min}
              max={ZOOM_LIMITS.max}
              step={ZOOM_LIMITS.step}
              value={z.amount}
              onChange={(e) =>
                dispatch({
                  type: "set-project-zoom",
                  zoom: { ...z, amount: Number(e.target.value) },
                })
              }
            />
            <p className="effects-hint">
              Zoom gently crops the outer edges of the frame while it moves —
              kept subtle by design.
            </p>
          </div>
        )}
      </div>

      {timeline.anyClamped && (
        <p className="warning-inline" role="note">
          Some cross-fades were shortened automatically because neighboring
          items are too brief for the full duration.
        </p>
      )}
    </section>
  );
}
