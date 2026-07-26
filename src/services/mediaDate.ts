/**
 * Creation-date resolution for uploaded visual media.
 *
 * The goal is a single trustworthy `{ timestamp, source }` per item, resolved
 * ONCE at upload time (never re-parsed later — sorting reads the stored value).
 * We never reject media when metadata is missing: the resolver always falls
 * back through file.lastModified to the upload timestamp.
 *
 * Priority (see {@link pickDate}):
 *   images  EXIF DateTimeOriginal → other embedded (DateTime/DateTimeDigitized)
 *           → File.lastModified → upload time
 *   videos  embedded/container creation_time (mp4 `mvhd`) → File.lastModified
 *           → upload time
 *
 * All parsing is done on small slices of the file (EXIF lives near the start;
 * for video we probe both the head and, if needed, the tail where a
 * non-faststart `moov` atom sits) so we never read whole clips into memory.
 */
import type { MediaDateSource } from "../types";

export interface ResolvedMediaDate {
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  source: MediaDateSource;
}

/** Bytes read from each end of a file when probing for metadata. */
const PROBE_BYTES = 1024 * 1024; // 1 MiB
/** Offset between the Mac/QuickTime epoch (1904-01-01) and Unix epoch (1970). */
const MAC_EPOCH_OFFSET_SECONDS = 2082844800;

/**
 * Pure priority resolver — the single source of truth for how candidate
 * timestamps collapse into one `{ timestamp, source }`. Kept side-effect-free
 * so it is exhaustively unit-testable without real files.
 *
 * A candidate counts as present only when it is a finite, strictly-positive
 * number (a zero or NaN lastModified — common for synthetic/streamed files —
 * is treated as absent and falls through to the upload time).
 */
export function pickDate(candidates: {
  embeddedOriginal?: number | null;
  embeddedCreated?: number | null;
  lastModified?: number | null;
  uploadTime: number;
}): ResolvedMediaDate {
  const usable = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

  if (usable(candidates.embeddedOriginal)) {
    return { timestamp: candidates.embeddedOriginal, source: "embedded-original" };
  }
  if (usable(candidates.embeddedCreated)) {
    return { timestamp: candidates.embeddedCreated, source: "embedded-created" };
  }
  if (usable(candidates.lastModified)) {
    return { timestamp: candidates.lastModified, source: "file-last-modified" };
  }
  return { timestamp: candidates.uploadTime, source: "upload-time" };
}

// ---- EXIF (JPEG) ------------------------------------------------------------

export interface ExifDates {
  /** EXIF DateTimeOriginal (0x9003) — when the shot was captured. */
  original: number | null;
  /** IFD0 DateTime (0x0132) or DateTimeDigitized (0x9004) — a weaker signal. */
  created: number | null;
}

const EXIF_TAG_DATETIME = 0x0132;
const EXIF_TAG_EXIF_IFD_POINTER = 0x8769;
const EXIF_TAG_DATETIME_ORIGINAL = 0x9003;
const EXIF_TAG_DATETIME_DIGITIZED = 0x9004;

/**
 * Extract EXIF date fields from a JPEG buffer. Returns `{ original, created }`
 * with either field null when absent. Non-JPEG / EXIF-less buffers yield two
 * nulls rather than throwing — callers then fall back down the priority chain.
 */
export function extractExifDates(buffer: ArrayBuffer): ExifDates {
  const none: ExifDates = { original: null, created: null };
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return none; // SOI

  // Walk JPEG markers looking for APP1 (0xFFE1) carrying an "Exif\0\0" header.
  let offset = 2;
  let tiffStart = -1;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break; // not a marker — malformed
    const marker = view.getUint8(offset + 1);
    // Standalone markers (RSTn, SOI, EOI) carry no length payload.
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segLength = view.getUint16(offset + 2);
    if (segLength < 2) break;
    if (marker === 0xe1 && offset + 4 + 6 <= view.byteLength) {
      const isExif =
        view.getUint32(offset + 4) === 0x45786966 && // "Exif"
        view.getUint16(offset + 8) === 0x0000;
      if (isExif) {
        tiffStart = offset + 10;
        break;
      }
    }
    if (marker === 0xda) break; // start of scan — no more metadata
    offset += 2 + segLength;
  }
  if (tiffStart < 0) return none;

  return parseTiff(view, tiffStart);
}

function parseTiff(view: DataView, tiff: number): ExifDates {
  const none: ExifDates = { original: null, created: null };
  if (tiff + 8 > view.byteLength) return none;
  const byteOrder = view.getUint16(tiff);
  const le = byteOrder === 0x4949; // "II" little-endian; "MM" (0x4d4d) big
  if (!le && byteOrder !== 0x4d4d) return none;

  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);

  const ifd0 = tiff + u32(tiff + 4);
  const result: ExifDates = { original: null, created: null };

  const readAscii = (valueOffset: number, count: number): string => {
    // ASCII values ≤ 4 bytes are stored inline in the entry's value field;
    // longer ones (date strings are 20 bytes) are referenced by offset.
    const at = count <= 4 ? valueOffset : tiff + u32(valueOffset);
    let s = "";
    for (let i = 0; i < count && at + i < view.byteLength; i++) {
      const c = view.getUint8(at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const scanIfd = (ifdOffset: number, onTag: (tag: number, entry: number) => void) => {
    if (ifdOffset + 2 > view.byteLength) return;
    const count = u16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      onTag(u16(entry), entry);
    }
  };

  let exifIfdPointer = -1;
  scanIfd(ifd0, (tag, entry) => {
    if (tag === EXIF_TAG_DATETIME) {
      result.created = parseExifDateString(readAscii(entry + 8, u32(entry + 4)));
    } else if (tag === EXIF_TAG_EXIF_IFD_POINTER) {
      exifIfdPointer = tiff + u32(entry + 8);
    }
  });

  if (exifIfdPointer >= 0) {
    scanIfd(exifIfdPointer, (tag, entry) => {
      if (tag === EXIF_TAG_DATETIME_ORIGINAL) {
        result.original = parseExifDateString(readAscii(entry + 8, u32(entry + 4)));
      } else if (tag === EXIF_TAG_DATETIME_DIGITIZED && result.created === null) {
        result.created = parseExifDateString(readAscii(entry + 8, u32(entry + 4)));
      }
    });
  }

  return result;
}

/**
 * Parse an EXIF datetime string "YYYY:MM:DD HH:MM:SS" (interpreted as local
 * time, matching how cameras write it). Returns ms, or null when malformed or
 * an obvious placeholder ("0000:00:00 00:00:00").
 */
export function parseExifDateString(value: string): number | null {
  const m = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  if (y === 0 || mo === 0 || d === 0) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  const t = date.getTime();
  return Number.isFinite(t) ? t : null;
}

// ---- MP4 / QuickTime `mvhd` -------------------------------------------------

/**
 * Extract the movie-header (`mvhd`) creation time from an MP4/MOV buffer.
 * `mvhd` is the first child of the `moov` atom; we locate it by signature so
 * we don't have to fully walk the box tree (robust to the atom's nesting and
 * to reading only a slice of the file). Returns ms, or null when absent or an
 * implausible value (creation_time == 0, or before 1970 / far in the future).
 */
export function extractMp4CreationTime(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // "mvhd" = 0x6d 0x76 0x68 0x64
  for (let i = 0; i + 16 <= bytes.length; i++) {
    if (
      bytes[i] === 0x6d &&
      bytes[i + 1] === 0x76 &&
      bytes[i + 2] === 0x68 &&
      bytes[i + 3] === 0x64
    ) {
      const version = view.getUint8(i + 4);
      let macSeconds: number;
      if (version === 1) {
        if (i + 20 > bytes.length) return null;
        const hi = view.getUint32(i + 8);
        const lo = view.getUint32(i + 12);
        macSeconds = hi * 0x100000000 + lo;
      } else {
        macSeconds = view.getUint32(i + 8);
      }
      if (macSeconds === 0) return null;
      const unixSeconds = macSeconds - MAC_EPOCH_OFFSET_SECONDS;
      const ms = unixSeconds * 1000;
      // Sanity window: after the Unix epoch and before year 2100.
      if (unixSeconds <= 0 || ms > 4102444800000) return null;
      return ms;
    }
  }
  return null;
}

// ---- top-level resolvers ----------------------------------------------------

async function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return file.slice(start, end).arrayBuffer();
}

/**
 * Resolve the creation date for a single uploaded item. Best-effort and never
 * throws for metadata reasons: any parse failure degrades to the next source.
 * `now` is injectable for deterministic tests.
 */
export async function resolveMediaDate(
  file: File,
  kind: "image" | "video",
  now: number = Date.now(),
): Promise<ResolvedMediaDate> {
  const lastModified =
    typeof file.lastModified === "number" ? file.lastModified : null;
  try {
    if (kind === "image") {
      const head = await readSlice(file, 0, Math.min(file.size, PROBE_BYTES));
      const exif = extractExifDates(head);
      return pickDate({
        embeddedOriginal: exif.original,
        embeddedCreated: exif.created,
        lastModified,
        uploadTime: now,
      });
    }
    // video: probe head first (faststart), then tail (moov at end).
    let created = extractMp4CreationTime(
      await readSlice(file, 0, Math.min(file.size, PROBE_BYTES)),
    );
    if (created === null && file.size > PROBE_BYTES) {
      created = extractMp4CreationTime(
        await readSlice(file, file.size - PROBE_BYTES, file.size),
      );
    }
    return pickDate({
      embeddedCreated: created,
      lastModified,
      uploadTime: now,
    });
  } catch {
    // Reading the file failed — still never reject the media.
    return pickDate({ lastModified, uploadTime: now });
  }
}
