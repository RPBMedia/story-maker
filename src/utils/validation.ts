/** File acceptance and duplicate detection. */

export const AUDIO_EXTENSIONS = [".mp3", ".wav"];
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const VIDEO_EXTENSIONS = [".mp4", ".webm"];

export type FileCategory = "audio" | "image" | "video";

export interface FileCheck {
  ok: boolean;
  category?: FileCategory;
  reason?: string;
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function classifyFile(
  file: File,
  accept: FileCategory[],
): FileCheck {
  if (file.size === 0) {
    return { ok: false, reason: `“${file.name}” is empty.` };
  }
  const ext = extensionOf(file.name);
  const category: FileCategory | undefined = AUDIO_EXTENSIONS.includes(ext)
    ? "audio"
    : IMAGE_EXTENSIONS.includes(ext)
      ? "image"
      : VIDEO_EXTENSIONS.includes(ext)
        ? "video"
        : undefined;
  if (!category) {
    return {
      ok: false,
      reason: `“${file.name}” is not a supported file type.`,
    };
  }
  if (!accept.includes(category)) {
    const wanted = accept.join(" or ");
    return {
      ok: false,
      reason: `“${file.name}” is a ${category} file — this step accepts ${wanted} files.`,
    };
  }
  return { ok: true, category };
}

/**
 * Duplicate detection uses meaningful characteristics (name + size +
 * lastModified), not the name alone: two different files may share a name,
 * and the same file re-picked from disk should still be caught.
 */
export function fileFingerprint(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function isDuplicate(file: File, existing: File[]): boolean {
  const fp = fileFingerprint(file);
  return existing.some((f) => fileFingerprint(f) === fp);
}
