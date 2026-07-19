import { useState } from "react";
import { useProject } from "../../state/ProjectContext";
import { UploadZone } from "../../components/UploadZone";
import { SortableCard } from "../../components/SortableCard";
import { useDragReorder } from "../../hooks/useDragReorder";
import { probeAV, probeImage } from "../../services/metadata";
import { classifyFile, isDuplicate } from "../../utils/validation";
import { formatBytes, formatSeconds } from "../../utils/format";
import type { VisualMediaItem } from "../../types";

export function MediaStage() {
  const { state, dispatch, plan, soundtrackDuration } = useProject();
  const [busy, setBusy] = useState(false);
  const reorder = useDragReorder((from, to) =>
    dispatch({ type: "reorder-visual", from, to }),
  );

  const allocated = new Map(
    plan.segments.map((s) => [s.item.id, s.duration] as const),
  );

  async function addFiles(files: File[]) {
    setBusy(true);
    const accepted: VisualMediaItem[] = [];
    const notices: string[] = [];
    const existing = state.visualItems.map((i) => i.file);
    for (const file of files) {
      const check = classifyFile(file, ["image", "video"]);
      if (!check.ok) {
        notices.push(check.reason ?? `“${file.name}” was rejected.`);
        continue;
      }
      if (isDuplicate(file, [...existing, ...accepted.map((a) => a.file)])) {
        notices.push(`“${file.name}” is already in the sequence — skipped.`);
        continue;
      }
      try {
        if (check.category === "image") {
          const meta = await probeImage(file);
          accepted.push({
            id: crypto.randomUUID(),
            kind: "image",
            file,
            name: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            width: meta.width ?? 0,
            height: meta.height ?? 0,
          });
        } else {
          const meta = await probeAV(file, "video");
          accepted.push({
            id: crypto.randomUUID(),
            kind: "video",
            file,
            name: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            duration: meta.duration ?? 0,
            width: meta.width ?? 0,
            height: meta.height ?? 0,
          });
        }
      } catch (e) {
        notices.push(e instanceof Error ? e.message : `“${file.name}” failed.`);
      }
    }
    if (accepted.length > 0) dispatch({ type: "add-visual", items: accepted });
    if (notices.length > 0) dispatch({ type: "add-notices", notices });
    setBusy(false);
  }

  return (
    <section aria-labelledby="media-title">
      <header className="stage-header">
        <div>
          <h2 id="media-title">Visual media</h2>
          <p className="stage-sub">
            Add images and video clips in one shared sequence — mix them
            freely. Images stretch to fill whatever time your videos leave.
          </p>
        </div>
        <div className="stage-metric">
          <span className="stage-metric__label">Sequence items</span>
          <span className="stage-metric__value">{state.visualItems.length}</span>
        </div>
      </header>

      <UploadZone
        accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,image/*,video/mp4,video/webm"
        label="Drop images or video clips here"
        hint="JPG, PNG, WebP, MP4 and WebM are supported."
        onFiles={addFiles}
      />
      {busy && (
        <p className="loading-note" role="status">
          Reading media metadata…
        </p>
      )}

      {soundtrackDuration === 0 && state.visualItems.length > 0 && (
        <p className="warning-inline" role="note">
          Image durations show as “–” until you add a soundtrack in step 1.
        </p>
      )}

      {state.visualItems.length === 0 && !busy ? (
        <div className="empty-state">
          <p>No visual media yet.</p>
          <p className="empty-state__hint">
            The final video plays these top to bottom, images and clips
            interleaved exactly as you order them.
          </p>
        </div>
      ) : (
        <ul className="card-list">
          {state.visualItems.map((item, i) => (
            <SortableCard
              key={item.id}
              index={i}
              count={state.visualItems.length}
              dragging={reorder.dragging === i}
              dragOver={reorder.dragOver === i}
              handleProps={reorder.handleProps(i)}
              targetProps={reorder.targetProps(i)}
              onMoveUp={() => dispatch({ type: "reorder-visual", from: i, to: i - 1 })}
              onMoveDown={() => dispatch({ type: "reorder-visual", from: i, to: i + 1 })}
              onRemove={() => dispatch({ type: "remove-visual", id: item.id })}
              removeLabel={`Remove ${item.name}`}
            >
              <div className="media-item">
                {item.kind === "image" ? (
                  <img
                    className="media-item__thumb"
                    src={item.previewUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <video
                    className="media-item__thumb"
                    src={item.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    controls
                    aria-label={`Preview ${item.name}`}
                  />
                )}
                <div className="media-item__info">
                  <span className="track__name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="track__meta">
                    <span className={`chip chip--${item.kind}`}>
                      {item.kind === "image" ? "Image" : "Video"}
                    </span>{" "}
                    {item.kind === "video"
                      ? `source ${formatSeconds(item.duration)} · `
                      : ""}
                    {formatBytes(item.size)}
                  </span>
                  <span className="track__meta">
                    In final video:{" "}
                    <strong>
                      {allocated.has(item.id)
                        ? formatSeconds(allocated.get(item.id) ?? 0)
                        : soundtrackDuration > 0
                          ? "not included (soundtrack ends earlier)"
                          : "–"}
                    </strong>
                  </span>
                </div>
              </div>
            </SortableCard>
          ))}
        </ul>
      )}
    </section>
  );
}
