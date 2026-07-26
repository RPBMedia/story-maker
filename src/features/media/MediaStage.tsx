import { useState } from "react";
import { useProject } from "../../state/ProjectContext";
import { UploadZone } from "../../components/UploadZone";
import { SortableCard } from "../../components/SortableCard";
import { MediaToolbar } from "./MediaToolbar";
import { useDragReorder } from "../../hooks/useDragReorder";
import { probeAV, probeImage } from "../../services/metadata";
import { resolveMediaDate } from "../../services/mediaDate";
import { classifyFile, isDuplicate } from "../../utils/validation";
import { formatBytes, formatMediaDate, formatSeconds } from "../../utils/format";
import {
  TRANSITION_LIMITS,
  ZOOM_LIMITS,
  type TransitionType,
  type VisualMediaItem,
  type ZoomEffectType,
} from "../../types";

export function MediaStage() {
  const { state, dispatch, timeline, soundtrackDuration } = useProject();
  const [busy, setBusy] = useState(false);
  const reorder = useDragReorder((from, to) =>
    dispatch({ type: "reorder-visual", from, to }),
  );

  const allocated = new Map(
    timeline.segments.map((s) => [s.item.id, s.duration] as const),
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
          const date = await resolveMediaDate(file, "image");
          accepted.push({
            id: crypto.randomUUID(),
            kind: "image",
            file,
            name: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            width: meta.width ?? 0,
            height: meta.height ?? 0,
            createdAt: date.timestamp,
            dateSource: date.source,
          });
        } else {
          const meta = await probeAV(file, "video");
          const date = await resolveMediaDate(file, "video");
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
            createdAt: date.timestamp,
            dateSource: date.source,
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

      {state.visualItems.length > 0 && <MediaToolbar />}

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
                  <span className="track__meta media-item__date">
                    {(() => {
                      const d = formatMediaDate(item.createdAt, item.dateSource);
                      return (
                        <>
                          <span className="media-item__date-label">
                            {d.label}
                          </span>{" "}
                          <span
                            className="media-item__date-value"
                            title={`Date source: ${d.sourceHint}`}
                          >
                            {d.value}
                          </span>
                        </>
                      );
                    })()}
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
                  <ItemEffects itemId={item.id} isLast={i === state.visualItems.length - 1} />
                </div>
              </div>
            </SortableCard>
          ))}
        </ul>
      )}
    </section>
  );
}


/** Per-item effect overrides. Null override = inherit the project default.
 * The transition belongs to the boundary AFTER this item, so the last item
 * offers no outgoing-transition control. */
function ItemEffects({ itemId, isLast }: { itemId: string; isLast: boolean }) {
  const { state, dispatch } = useProject();
  const o = state.effectOverrides[itemId];
  const tValue =
    o?.transition === undefined || o.transition === null
      ? "default"
      : o.transition.type;
  const zValue =
    o?.zoom === undefined || o.zoom === null ? "default" : o.zoom.type;

  return (
    <details className="item-effects">
      <summary>Effects</summary>
      <div className="item-effects__body">
        {!isLast && (
          <label className="field field--inline">
            <span>Transition after this item</span>
            <select
              value={tValue}
              onChange={(e) => {
                const v = e.target.value;
                dispatch({
                  type: "set-item-transition",
                  id: itemId,
                  transition:
                    v === "default"
                      ? null
                      : {
                          type: v as TransitionType,
                          duration:
                            o?.transition?.duration ??
                            state.projectTransition.duration,
                        },
                });
              }}
            >
              <option value="default">Use project default</option>
              <option value="none">No transition</option>
              <option value="crossfade">Cross-fade</option>
            </select>
          </label>
        )}
        {!isLast && tValue === "crossfade" && (
          <label className="field field--inline">
            <span>
              Duration: {(o?.transition?.duration ?? TRANSITION_LIMITS.default).toFixed(2)}s
            </span>
            <input
              type="range"
              min={TRANSITION_LIMITS.min}
              max={TRANSITION_LIMITS.max}
              step={TRANSITION_LIMITS.step}
              value={o?.transition?.duration ?? TRANSITION_LIMITS.default}
              onChange={(e) =>
                dispatch({
                  type: "set-item-transition",
                  id: itemId,
                  transition: {
                    type: "crossfade",
                    duration: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        )}
        <label className="field field--inline">
          <span>Subtle zoom</span>
          <select
            value={zValue}
            onChange={(e) => {
              const v = e.target.value;
              dispatch({
                type: "set-item-zoom",
                id: itemId,
                zoom:
                  v === "default"
                    ? null
                    : {
                        type: v as ZoomEffectType,
                        amount: o?.zoom?.amount ?? state.projectZoom.amount,
                      },
              });
            }}
          >
            <option value="default">Use project default</option>
            <option value="none">Off</option>
            <option value="zoom-in">Zoom in</option>
            <option value="zoom-out">Zoom out</option>
          </select>
        </label>
        {zValue !== "default" && zValue !== "none" && (
          <label className="field field--inline">
            <span>
              Amount: {Math.round(((o?.zoom?.amount ?? ZOOM_LIMITS.default) - 1) * 100)}%
            </span>
            <input
              type="range"
              min={ZOOM_LIMITS.min}
              max={ZOOM_LIMITS.max}
              step={ZOOM_LIMITS.step}
              value={o?.zoom?.amount ?? ZOOM_LIMITS.default}
              onChange={(e) =>
                dispatch({
                  type: "set-item-zoom",
                  id: itemId,
                  zoom: {
                    type: zValue as ZoomEffectType,
                    amount: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        )}
      </div>
    </details>
  );
}
