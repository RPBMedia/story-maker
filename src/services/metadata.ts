/** Browser-native media metadata probing (no ffmpeg needed for this). */
import type { MediaMetadata } from "../types";

/** Probe duration (and dimensions for video) via an HTMLMediaElement. */
export function probeAV(
  file: File,
  kind: "audio" | "video",
): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind);
    el.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      el.load();
    };

    el.onloadedmetadata = () => {
      const meta: MediaMetadata = { duration: el.duration };
      if (el instanceof HTMLVideoElement) {
        meta.width = el.videoWidth;
        meta.height = el.videoHeight;
      }
      cleanup();
      if (!Number.isFinite(meta.duration) || (meta.duration ?? 0) <= 0) {
        reject(new Error(`Could not read the duration of “${file.name}”.`));
        return;
      }
      resolve(meta);
    };
    el.onerror = () => {
      cleanup();
      reject(
        new Error(
          `“${file.name}” could not be read — it may be corrupt or use an unsupported codec.`,
        ),
      );
    };
    el.src = url;
  });
}

/** Probe intrinsic dimensions of an image. */
export function probeImage(file: File): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const meta = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      if (!meta.width || !meta.height) {
        reject(new Error(`“${file.name}” could not be decoded as an image.`));
        return;
      }
      resolve(meta);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`“${file.name}” could not be decoded as an image.`));
    };
    img.src = url;
  });
}
