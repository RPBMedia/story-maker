/** Calm, prominent render-time expectation panel. Informational styling —
 * never danger styling; never hidden in tooltips. */
import type { RenderTimeEstimate } from "../types";

export function RenderTimeInfo({
  estimate,
  compact = false,
}: {
  estimate: RenderTimeEstimate | null;
  compact?: boolean;
}) {
  return (
    <div className={`info-panel${compact ? " info-panel--compact" : ""}`} role="note">
      <span className="info-panel__icon" aria-hidden="true">
        ⏱
      </span>
      <div>
        <p className="info-panel__title">
          Rendering usually takes around 5–15 minutes
          {estimate ? (
            <>
              {" "}
              — this project looks like <strong>{estimate.label}</strong>.
            </>
          ) : (
            "."
          )}
        </p>
        {!compact && (
          <p className="info-panel__body">
            The actual time depends on your video length, media files, enabled
            effects, and device performance. Keep this tab open while
            StoryMaker creates your video — refreshing or closing the page
            cancels the render, and keeping your device awake helps.
          </p>
        )}
        {!compact && estimate && estimate.factors.length > 0 && (
          <p className="info-panel__factors">
            Taking longer because of: {estimate.factors.join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
