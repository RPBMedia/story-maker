import { describe, expect, it } from "vitest";
import {
  extractExifDates,
  extractMp4CreationTime,
  parseExifDateString,
  pickDate,
  resolveMediaDate,
} from "./mediaDate";

/**
 * Build a minimal but valid JPEG carrying an EXIF APP1 segment with an IFD0
 * DateTime (0x0132) and an Exif SubIFD DateTimeOriginal (0x9003). Little-endian
 * ("II"). Offsets are hand-laid; see the comments for the map.
 */
function buildExifJpeg(dateTime: string, dateTimeOriginal: string): ArrayBuffer {
  const buf = new Uint8Array(108);
  const dv = new DataView(buf.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < 19; i++) buf[at + i] = s.charCodeAt(i);
    buf[at + 19] = 0; // NUL terminator (strings are 20 bytes)
  };

  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xe1; // APP1
  dv.setUint16(4, 104); // segment length (BE): 2 + "Exif\0\0"(6) + TIFF(96)
  buf[6] = 0x45; // E
  buf[7] = 0x78; // x
  buf[8] = 0x69; // i
  buf[9] = 0x66; // f
  buf[10] = 0;
  buf[11] = 0;

  const tiff = 12;
  buf[tiff] = 0x49; // "II"
  buf[tiff + 1] = 0x49;
  dv.setUint16(tiff + 2, 42, true);
  dv.setUint32(tiff + 4, 8, true); // IFD0 at tiff+8 (index 20)

  // IFD0 (index 20)
  dv.setUint16(20, 2, true); // 2 entries
  // entry0: DateTime 0x0132, ASCII, count 20, value at tiff+56 (index 68)
  dv.setUint16(22, 0x0132, true);
  dv.setUint16(24, 2, true);
  dv.setUint32(26, 20, true);
  dv.setUint32(30, 56, true);
  // entry1: ExifIFDPointer 0x8769, LONG, count 1, value = tiff-rel 38 (index 50)
  dv.setUint16(34, 0x8769, true);
  dv.setUint16(36, 4, true);
  dv.setUint32(38, 1, true);
  dv.setUint32(42, 38, true);
  dv.setUint32(46, 0, true); // no next IFD

  // Exif SubIFD (index 50)
  dv.setUint16(50, 1, true); // 1 entry
  // DateTimeOriginal 0x9003, ASCII, count 20, value at tiff+76 (index 88)
  dv.setUint16(52, 0x9003, true);
  dv.setUint16(54, 2, true);
  dv.setUint32(56, 20, true);
  dv.setUint32(60, 76, true);
  dv.setUint32(64, 0, true); // no next IFD

  ascii(68, dateTime); // DateTime string (index 68)
  ascii(88, dateTimeOriginal); // DateTimeOriginal string (index 88)

  return buf.buffer;
}

describe("parseExifDateString", () => {
  it("parses 'YYYY:MM:DD HH:MM:SS' as a local timestamp", () => {
    const t = parseExifDateString("2019:07:14 08:09:10");
    expect(t).toBe(new Date(2019, 6, 14, 8, 9, 10).getTime());
  });

  it("rejects the zero placeholder and malformed strings", () => {
    expect(parseExifDateString("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDateString("not a date")).toBeNull();
    expect(parseExifDateString("")).toBeNull();
  });
});

describe("extractExifDates", () => {
  it("reads DateTimeOriginal and DateTime from a JPEG", () => {
    const buf = buildExifJpeg("2020:01:02 03:04:05", "2019:07:14 08:09:10");
    const { original, created } = extractExifDates(buf);
    expect(original).toBe(new Date(2019, 6, 14, 8, 9, 10).getTime());
    expect(created).toBe(new Date(2020, 0, 2, 3, 4, 5).getTime());
  });

  it("returns nulls for a non-JPEG buffer (no rejection)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer;
    expect(extractExifDates(png)).toEqual({ original: null, created: null });
  });
});

describe("extractMp4CreationTime", () => {
  function buildMvhd(macSeconds: number, version = 0): ArrayBuffer {
    const buf = new Uint8Array(24);
    const dv = new DataView(buf.buffer);
    // some leading bytes, then the mvhd signature
    const p = 4;
    buf[p] = 0x6d; // m
    buf[p + 1] = 0x76; // v
    buf[p + 2] = 0x68; // h
    buf[p + 3] = 0x64; // d
    buf[p + 4] = version;
    dv.setUint32(p + 8, macSeconds); // creation_time (BE)
    return buf.buffer;
  }

  it("converts the QuickTime epoch to Unix ms", () => {
    const unixSeconds = Math.floor(Date.UTC(2021, 6, 14, 10, 30, 0) / 1000);
    const macSeconds = unixSeconds + 2082844800;
    expect(extractMp4CreationTime(buildMvhd(macSeconds))).toBe(
      unixSeconds * 1000,
    );
  });

  it("returns null when creation_time is zero or absent", () => {
    expect(extractMp4CreationTime(buildMvhd(0))).toBeNull();
    const noBox = new Uint8Array(32).buffer;
    expect(extractMp4CreationTime(noBox)).toBeNull();
  });
});

describe("pickDate (priority + fallbacks)", () => {
  const uploadTime = 1_700_000_000_000;

  it("prefers embedded-original over everything", () => {
    expect(
      pickDate({
        embeddedOriginal: 111,
        embeddedCreated: 222,
        lastModified: 333,
        uploadTime,
      }),
    ).toEqual({ timestamp: 111, source: "embedded-original" });
  });

  it("falls back to embedded-created, then file-last-modified", () => {
    expect(
      pickDate({ embeddedCreated: 222, lastModified: 333, uploadTime }),
    ).toEqual({ timestamp: 222, source: "embedded-created" });
    expect(pickDate({ lastModified: 333, uploadTime })).toEqual({
      timestamp: 333,
      source: "file-last-modified",
    });
  });

  it("falls back to upload-time when nothing else is usable", () => {
    expect(pickDate({ uploadTime })).toEqual({
      timestamp: uploadTime,
      source: "upload-time",
    });
    // a zero/NaN lastModified is treated as absent
    expect(pickDate({ lastModified: 0, uploadTime })).toEqual({
      timestamp: uploadTime,
      source: "upload-time",
    });
  });
});

describe("resolveMediaDate (end to end)", () => {
  it("resolves a JPEG's capture date to embedded-original", async () => {
    const buf = buildExifJpeg("2020:01:02 03:04:05", "2019:07:14 08:09:10");
    const file = new File([buf], "IMG_1.jpg", { type: "image/jpeg" });
    const resolved = await resolveMediaDate(file, "image", 1_700_000_000_000);
    expect(resolved.source).toBe("embedded-original");
    expect(resolved.timestamp).toBe(new Date(2019, 6, 14, 8, 9, 10).getTime());
  });

  it("falls back to upload-time for an image with no metadata", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "plain.png");
    // lastModified is set by the File ctor; force the no-metadata path by
    // asserting the source is one of the honest fallbacks (never 'original').
    const resolved = await resolveMediaDate(file, "image", 1_700_000_000_000);
    expect(["file-last-modified", "upload-time"]).toContain(resolved.source);
  });
});
