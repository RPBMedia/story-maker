import { useState } from "react";
import { useProject } from "../../state/ProjectContext";
import { usePlan } from "../plan/PlanContext";
import { UploadZone } from "../../components/UploadZone";
import { SortableCard } from "../../components/SortableCard";
import { useDragReorder } from "../../hooks/useDragReorder";
import { probeAV } from "../../services/metadata";
import { classifyFile, isDuplicate } from "../../utils/validation";
import { formatBytes, formatDuration } from "../../utils/format";
import type { AudioTrack } from "../../types";

export function SoundtrackStage() {
  const { state, dispatch, soundtrackDuration } = useProject();
  const { entitlements } = usePlan();
  const [busy, setBusy] = useState(false);
  const reorder = useDragReorder((from, to) =>
    dispatch({ type: "reorder-audio", from, to }),
  );

  const maxTracks = entitlements.maxAudioTracks;
  const atTrackLimit =
    maxTracks !== null && state.audioTracks.length >= maxTracks;

  async function addFiles(files: File[]) {
    setBusy(true);
    const accepted: AudioTrack[] = [];
    const notices: string[] = [];
    const existing = state.audioTracks.map((t) => t.file);
    for (const file of files) {
      const check = classifyFile(file, ["audio"]);
      if (!check.ok) {
        notices.push(check.reason ?? `“${file.name}” was rejected.`);
        continue;
      }
      if (isDuplicate(file, [...existing, ...accepted.map((a) => a.file)])) {
        notices.push(`“${file.name}” is already in the soundtrack — skipped.`);
        continue;
      }
      // Plan gate: multiple audio tracks are a paid feature.
      if (
        maxTracks !== null &&
        state.audioTracks.length + accepted.length >= maxTracks
      ) {
        notices.push(
          `Your ${entitlements.label} plan includes ${maxTracks} audio track${
            maxTracks === 1 ? "" : "s"
          }. Upgrade to Creator ($5) or Pro ($15) to layer multiple tracks.`,
        );
        break;
      }
      try {
        const meta = await probeAV(file, "audio");
        accepted.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          duration: meta.duration ?? 0,
          size: file.size,
          previewUrl: URL.createObjectURL(file),
        });
      } catch (e) {
        notices.push(e instanceof Error ? e.message : `“${file.name}” failed.`);
      }
    }
    if (accepted.length > 0) dispatch({ type: "add-audio", tracks: accepted });
    if (notices.length > 0) dispatch({ type: "add-notices", notices });
    setBusy(false);
  }

  return (
    <section aria-labelledby="soundtrack-title">
      <header className="stage-header">
        <div>
          <h2 id="soundtrack-title">Soundtrack</h2>
          <p className="stage-sub">
            Add one or more audio tracks. They play back to back, in this
            order, and set the length of your final video.
          </p>
        </div>
        <div className="stage-metric">
          <span className="stage-metric__label">Total duration</span>
          <span className="stage-metric__value">
            {formatDuration(soundtrackDuration)}
          </span>
        </div>
      </header>

      <UploadZone
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        label="Drop MP3 or WAV files here"
        hint="You can add several tracks and reorder them below."
        onFiles={addFiles}
      />
      {busy && (
        <p className="loading-note" role="status">
          Reading audio metadata…
        </p>
      )}
      {maxTracks !== null && (
        <p className="plan-hint" role="note">
          {atTrackLimit ? (
            <>
              Your <strong>{entitlements.label}</strong> plan supports{" "}
              {maxTracks} audio track{maxTracks === 1 ? "" : "s"}. Upgrade to
              Creator or Pro to layer multiple tracks.
            </>
          ) : (
            <>
              <strong>{entitlements.label}</strong> plan: up to {maxTracks}{" "}
              audio track{maxTracks === 1 ? "" : "s"}.
            </>
          )}
        </p>
      )}

      {state.audioTracks.length === 0 && !busy ? (
        <div className="empty-state">
          <p>No tracks yet.</p>
          <p className="empty-state__hint">
            Your soundtrack defines the video's total length — start here.
          </p>
        </div>
      ) : (
        <ul className="card-list">
          {state.audioTracks.map((t, i) => (
            <SortableCard
              key={t.id}
              index={i}
              count={state.audioTracks.length}
              dragging={reorder.dragging === i}
              dragOver={reorder.dragOver === i}
              handleProps={reorder.handleProps(i)}
              targetProps={reorder.targetProps(i)}
              onMoveUp={() => dispatch({ type: "reorder-audio", from: i, to: i - 1 })}
              onMoveDown={() => dispatch({ type: "reorder-audio", from: i, to: i + 1 })}
              onRemove={() => dispatch({ type: "remove-audio", id: t.id })}
              removeLabel={`Remove ${t.name}`}
            >
              <div className="track">
                <div className="track__info">
                  <span className="track__name" title={t.name}>
                    {t.name}
                  </span>
                  <span className="track__meta">
                    {formatDuration(t.duration)} · {formatBytes(t.size)}
                  </span>
                </div>
                <audio
                  className="track__player"
                  src={t.previewUrl}
                  controls
                  preload="none"
                  aria-label={`Preview ${t.name}`}
                />
              </div>
            </SortableCard>
          ))}
        </ul>
      )}
    </section>
  );
}
