/** Renders title / end cards to an image the normal video pipeline can consume.
 *
 * A card is just a generated still: brand-dark background + centred text, drawn
 * on a canvas at the export resolution and handed to the renderer as an image
 * segment. Fade and zoom are applied later by the render step (fade) and the
 * existing zoompan effect (zoom), so nothing here bakes motion into the pixels.
 */
import type { ImageMediaItem } from "../types";

export const TITLE_CARD_ID = "__title-card__";
export const END_CARD_ID = "__end-card__";

/** Greedily wrap `text` into lines no wider than `maxWidth`, using the provided
 * width measurer. Pure and unit-testable (no canvas needed). */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (measure(next) <= maxWidth) line = next;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Draw a card and return it as a PNG blob at the given output dimensions. */
export async function renderCardImage(
  text: string,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for card rendering.");

  // Brand-dark gradient background with a soft accent glow (matches the app).
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0e1219");
  bg.addColorStop(1, "#0a0d13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(
    width * 0.5, height * 0.42, 0,
    width * 0.5, height * 0.42, Math.max(width, height) * 0.55,
  );
  glow.addColorStop(0, "rgba(109,141,255,0.16)");
  glow.addColorStop(1, "rgba(109,141,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const short = Math.min(width, height);
  let fontSize = Math.round(short * 0.11);
  const maxWidth = width * 0.82;
  const font = (size: number) =>
    `700 ${size}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eaeefa";

  // Shrink the font until the wrapped block fits comfortably in frame.
  let lines: string[] = [];
  for (; fontSize >= Math.round(short * 0.05); fontSize -= 2) {
    ctx.font = font(fontSize);
    lines = wrapText(text || "", maxWidth, (s) => ctx.measureText(s).width);
    const blockHeight = lines.length * fontSize * 1.25;
    if (blockHeight <= height * 0.7) break;
  }

  ctx.font = font(fontSize);
  const lineHeight = fontSize * 1.25;
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lineHeight));

  // Accent underline flourish beneath the text block.
  const underlineY = startY + (lines.length - 1) * lineHeight + lineHeight * 0.85;
  ctx.strokeStyle = "#6d8dff";
  ctx.lineWidth = Math.max(2, Math.round(short * 0.006));
  ctx.beginPath();
  ctx.moveTo(width / 2 - short * 0.06, underlineY);
  ctx.lineTo(width / 2 + short * 0.06, underlineY);
  ctx.stroke();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Card toBlob failed"))),
      "image/png",
    );
  });
}

/** Wrap a rendered card blob as a synthetic image media item the timeline and
 * renderer treat like any other still. */
export function buildCardItem(
  role: "title" | "end",
  blob: Blob,
  width: number,
  height: number,
): ImageMediaItem {
  const id = role === "title" ? TITLE_CARD_ID : END_CARD_ID;
  const file = new File([blob], `${role}-card.png`, { type: "image/png" });
  return {
    id,
    file,
    name: `${role}-card.png`,
    size: file.size,
    previewUrl: URL.createObjectURL(file),
    createdAt: 0,
    dateSource: "upload-time",
    kind: "image",
    width,
    height,
  };
}
