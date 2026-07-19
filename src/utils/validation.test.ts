import { describe, expect, it } from "vitest";
import { classifyFile, fileFingerprint, isDuplicate } from "./validation";

function f(name: string, size = 100, lastModified = 1000): File {
  const file = new File([new Uint8Array(size)], name, { lastModified });
  return file;
}

describe("classifyFile", () => {
  it("accepts supported audio for the audio step", () => {
    expect(classifyFile(f("song.mp3"), ["audio"]).ok).toBe(true);
    expect(classifyFile(f("Song.WAV"), ["audio"]).ok).toBe(true);
  });

  it("accepts images and videos for the media step", () => {
    for (const name of ["a.jpg", "b.jpeg", "c.png", "d.webp"]) {
      expect(classifyFile(f(name), ["image", "video"]).category).toBe("image");
    }
    for (const name of ["e.mp4", "g.webm"]) {
      expect(classifyFile(f(name), ["image", "video"]).category).toBe("video");
    }
  });

  it("rejects unsupported types with a human reason", () => {
    const check = classifyFile(f("doc.pdf"), ["audio"]);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not a supported file type/);
  });

  it("rejects files in the wrong step with guidance", () => {
    const check = classifyFile(f("clip.mp4"), ["audio"]);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/this step accepts audio/);
  });

  it("rejects empty files", () => {
    expect(classifyFile(f("silent.mp3", 0), ["audio"]).ok).toBe(false);
  });
});

describe("duplicate detection", () => {
  it("flags same name+size+mtime as duplicate", () => {
    expect(isDuplicate(f("a.mp3"), [f("a.mp3")])).toBe(true);
  });

  it("does NOT flag same name with different characteristics", () => {
    expect(isDuplicate(f("a.mp3", 100, 1), [f("a.mp3", 200, 2)])).toBe(false);
  });

  it("fingerprints combine name, size, and mtime", () => {
    expect(fileFingerprint(f("a.mp3", 5, 7))).toBe("a.mp3::5::7");
  });
});
