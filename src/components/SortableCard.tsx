import type { ReactNode } from "react";

interface SortableCardProps {
  index: number;
  count: number;
  dragging: boolean;
  dragOver: boolean;
  handleProps: Record<string, unknown>;
  targetProps: Record<string, unknown>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}

/**
 * Shared list-card chrome: order badge, drag handle, keyboard-accessible
 * move buttons, and a remove action. Content goes in the middle.
 */
export function SortableCard({
  index,
  count,
  dragging,
  dragOver,
  handleProps,
  targetProps,
  onMoveUp,
  onMoveDown,
  onRemove,
  removeLabel,
  children,
}: SortableCardProps) {
  return (
    <li
      className={`card sortable${dragging ? " sortable--dragging" : ""}${
        dragOver ? " sortable--over" : ""
      }`}
      {...targetProps}
    >
      <div
        className="sortable__handle"
        aria-label={`Drag to reorder (position ${index + 1} of ${count})`}
        title="Drag to reorder"
        {...handleProps}
      >
        <span aria-hidden="true">⠿</span>
      </div>
      <span className="sortable__order" aria-hidden="true">
        {index + 1}
      </span>
      <div className="sortable__body">{children}</div>
      <div className="sortable__actions">
        <button
          type="button"
          className="btn btn--icon"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label={`Move up (currently position ${index + 1})`}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={onMoveDown}
          disabled={index === count - 1}
          aria-label={`Move down (currently position ${index + 1})`}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn btn--icon btn--danger"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
