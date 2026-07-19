import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialProjectState,
  projectReducer,
  soundtrackDuration,
  type ProjectState,
} from "./projectReducer";
import type { AudioTrack, ImageMediaItem } from "../types";

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    revokeObjectURL: vi.fn(),
    createObjectURL: vi.fn(() => "blob:x"),
  });
});

let n = 0;
function track(duration: number): AudioTrack {
  n += 1;
  return {
    id: `a${n}`,
    file: new File([], `a${n}.mp3`),
    name: `a${n}.mp3`,
    duration,
    size: 100,
    previewUrl: `blob:a${n}`,
  };
}
function image(): ImageMediaItem {
  n += 1;
  return {
    id: `i${n}`,
    kind: "image",
    file: new File([], `i${n}.png`),
    name: `i${n}.png`,
    size: 100,
    previewUrl: `blob:i${n}`,
    width: 10,
    height: 10,
  };
}

function withTracks(...durations: number[]): ProjectState {
  return projectReducer(initialProjectState, {
    type: "add-audio",
    tracks: durations.map(track),
  });
}

describe("projectReducer", () => {
  it("adds audio and computes soundtrack duration", () => {
    const s = withTracks(10, 20.5);
    expect(s.audioTracks).toHaveLength(2);
    expect(soundtrackDuration(s)).toBe(30.5);
  });

  it("reorders audio tracks", () => {
    const s = withTracks(1, 2, 3);
    const ids = s.audioTracks.map((t) => t.id);
    const s2 = projectReducer(s, { type: "reorder-audio", from: 0, to: 2 });
    expect(s2.audioTracks.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("ignores out-of-range reorders", () => {
    const s = withTracks(1, 2);
    expect(projectReducer(s, { type: "reorder-audio", from: 0, to: 9 })).toBe(s);
  });

  it("reorders visual items in one shared sequence", () => {
    let s = projectReducer(initialProjectState, {
      type: "add-visual",
      items: [image(), image(), image()],
    });
    const ids = s.visualItems.map((i) => i.id);
    s = projectReducer(s, { type: "reorder-visual", from: 2, to: 0 });
    expect(s.visualItems.map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it("removes items and revokes their preview URLs", () => {
    const s = withTracks(5);
    const id = s.audioTracks[0].id;
    const s2 = projectReducer(s, { type: "remove-audio", id });
    expect(s2.audioTracks).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(s.audioTracks[0].previewUrl);
  });

  it("blocks duplicate render starts", () => {
    let s = projectReducer(initialProjectState, { type: "render-started" });
    const again = projectReducer(s, { type: "render-started" });
    expect(again).toBe(s);
    expect(s.renderStatus).toBe("rendering");
  });

  it("walks the full render lifecycle", () => {
    let s = projectReducer(initialProjectState, { type: "render-started" });
    s = projectReducer(s, {
      type: "render-progress",
      progress: { stage: "combining", overall: 0.8 },
    });
    expect(s.renderProgress.overall).toBe(0.8);
    s = projectReducer(s, {
      type: "render-succeeded",
      result: { url: "blob:out", blob: new Blob(), size: 9, duration: 30 },
    });
    expect(s.renderStatus).toBe("done");
    expect(s.result?.duration).toBe(30);
  });

  it("keeps the project intact after a failed render", () => {
    let s = withTracks(10);
    s = projectReducer(s, { type: "render-started" });
    s = projectReducer(s, {
      type: "render-failed",
      error: { message: "boom", projectIntact: true },
    });
    expect(s.renderStatus).toBe("error");
    expect(s.audioTracks).toHaveLength(1);
  });

  it("ignores progress events after cancellation", () => {
    let s = projectReducer(initialProjectState, { type: "render-started" });
    s = projectReducer(s, { type: "render-cancelled" });
    const s2 = projectReducer(s, {
      type: "render-progress",
      progress: { stage: "combining", overall: 0.5 },
    });
    expect(s2.renderProgress.overall).toBe(0);
  });

  it("revokes the stale output URL when a new render starts", () => {
    let s = projectReducer(initialProjectState, { type: "render-started" });
    s = projectReducer(s, {
      type: "render-succeeded",
      result: { url: "blob:old", blob: new Blob(), size: 1, duration: 1 },
    });
    projectReducer(s, { type: "render-started" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:old");
  });

  it("reset clears everything and revokes all URLs", () => {
    let s = withTracks(5, 5);
    s = projectReducer(s, { type: "add-visual", items: [image()] });
    const s2 = projectReducer(s, { type: "reset-project" });
    expect(s2).toEqual(initialProjectState);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
});
