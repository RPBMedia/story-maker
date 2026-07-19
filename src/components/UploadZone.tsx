import { useId, useRef, useState, type ReactNode } from "react";

interface UploadZoneProps {
  accept: string;
  label: string;
  hint: string;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}

/** Drag-and-drop + click-to-browse upload area. */
export function UploadZone({
  accept,
  label,
  hint,
  onFiles,
  children,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const inputId = useId();

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      className={`upload-zone${active ? " upload-zone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        pick(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple
        className="visually-hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />
      <div className="upload-zone__inner">
        {children}
        <p className="upload-zone__label">{label}</p>
        <p className="upload-zone__hint">{hint}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </button>
      </div>
    </div>
  );
}
