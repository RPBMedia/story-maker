import { useRef, useState } from "react";

/**
 * Minimal HTML5 drag-and-drop list reordering. Keyboard users get the same
 * capability through the explicit move up/down buttons rendered next to the
 * drag handle (see SortableCard).
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  return {
    dragOver,
    dragging,
    handleProps: (index: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragFrom.current = index;
        setDragging(index);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        dragFrom.current = null;
        setDragging(null);
        setDragOver(null);
      },
    }),
    targetProps: (index: number) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(index);
      },
      onDragLeave: () => setDragOver((cur) => (cur === index ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragFrom.current;
        dragFrom.current = null;
        setDragOver(null);
        setDragging(null);
        if (from !== null && from !== index) onMove(from, index);
      },
    }),
  };
}
