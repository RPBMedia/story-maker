/**
 * Ordering toolbar shown above the media grid. Owns the Sort dropdown, the
 * Shuffle button, the current-order indicator, and the one-level Undo.
 *
 * All ordering is computed here with pure helpers and dispatched as a
 * pre-computed sequence — the reducer stores it verbatim and the renderer uses
 * exactly that order, so shuffling/sorting affects the exported video, not
 * just the UI. Reordering only moves existing item references, so each item's
 * zoom and transition settings travel with it untouched.
 */
import { useProject } from "../../state/ProjectContext";
import {
  SORT_MODES,
  SORT_MODE_LABELS,
  shuffleDistinct,
  sortVisualItems,
} from "../../utils/ordering";
import type { OrderingMode, SortOrderingMode } from "../../types";

const ORDER_BADGE: Record<OrderingMode, string> = {
  manual: "Manual",
  "date-asc": "Oldest first",
  "date-desc": "Newest first",
  "name-asc": "Filename A→Z",
  "name-desc": "Filename Z→A",
  shuffled: "Shuffled",
};

export function MediaToolbar() {
  const { state, dispatch } = useProject();
  const { orderingMode, orderSnapshot, visualItems } = state;
  const canShuffle = visualItems.length > 1;

  function applySort(mode: SortOrderingMode) {
    const items = sortVisualItems(visualItems, mode);
    dispatch({ type: "set-ordering", mode, items });
  }

  function applyShuffle() {
    if (!canShuffle) return;
    const items = shuffleDistinct(visualItems);
    dispatch({ type: "set-ordering", mode: "shuffled", items });
  }

  return (
    <div className="media-toolbar" role="group" aria-label="Media ordering">
      <label className="media-toolbar__sort">
        <span className="media-toolbar__label">Sort</span>
        <select
          value={orderingMode}
          onChange={(e) => {
            const value = e.target.value as OrderingMode;
            if (value === "shuffled") return; // reflect-only, not selectable
            applySort(value);
          }}
        >
          {SORT_MODES.map((m) => (
            <option key={m} value={m}>
              {SORT_MODE_LABELS[m]}
            </option>
          ))}
          {/* Present only to reflect a shuffled state without a React warning
              about a value with no matching option. */}
          {orderingMode === "shuffled" && (
            <option value="shuffled">Shuffled</option>
          )}
        </select>
      </label>

      <button
        type="button"
        className="btn btn--secondary media-toolbar__shuffle"
        onClick={applyShuffle}
        disabled={!canShuffle}
        title={
          canShuffle
            ? "Randomly reorder every item"
            : "Add at least two items to shuffle"
        }
      >
        Shuffle
      </button>

      <div className="media-toolbar__status">
        <span className="media-toolbar__order-label">Order</span>
        <span
          className={`media-toolbar__order-badge media-toolbar__order-badge--${
            orderingMode === "manual" ? "manual" : "auto"
          }`}
        >
          {ORDER_BADGE[orderingMode]}
        </span>
        {orderSnapshot && (
          <button
            type="button"
            className="btn btn--ghost media-toolbar__undo"
            onClick={() => dispatch({ type: "undo-ordering" })}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
