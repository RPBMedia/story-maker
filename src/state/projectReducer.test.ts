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
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
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

describe("visual effect settings", () => {
  it("defaults to no transition and no zoom (old projects unaffected)", () => {
    expect(initialProjectState.projectTransition.type).toBe("none");
    expect(initialProjectState.projectZoom.type).toBe("none");
    expect(initialProjectState.effectOverrides).toEqual({});
  });

  it("stores project-level effect settings and re-arms confirmation", () => {
    let s = projectReducer(initialProjectState, { type: "confirm-export" });
    expect(s.exportConfirmed).toBe(true);
    s = projectReducer(s, {
      type: "set-project-transition",
      transition: { type: "crossfade", duration: 0.5 },
    });
    expect(s.projectTransition).toEqual({ type: "crossfade", duration: 0.5 });
    expect(s.exportConfirmed).toBe(false); // config change re-arms confirm
  });

  it("stores per-item overrides and null means inherit", () => {
    let s = projectReducer(initialProjectState, {
      type: "set-item-zoom",
      id: "item-1",
      zoom: { type: "zoom-in", amount: 1.05 },
    });
    expect(s.effectOverrides["item-1"]?.zoom).toEqual({
      type: "zoom-in",
      amount: 1.05,
    });
    s = projectReducer(s, { type: "set-item-zoom", id: "item-1", zoom: null });
    expect(s.effectOverrides["item-1"]?.zoom).toBeNull();
  });

  it("adding media re-arms the export confirmation", () => {
    let s = projectReducer(initialProjectState, { type: "confirm-export" });
    s = projectReducer(s, { type: "add-visual", items: [image()] });
    expect(s.exportConfirmed).toBe(false);
  });
});

describe("ordering", () => {
  function withItems(count: number): ProjectState {
    return projectReducer(initialProjectState, {
      type: "add-visual",
      items: Array.from({ length: count }, () => image()),
    });
  }

  it("starts in manual mode with nothing to undo", () => {
    expect(initialProjectState.orderingMode).toBe("manual");
    expect(initialProjectState.orderSnapshot).toBeNull();
  });

  it("set-ordering stores the new order, mode, and an undo snapshot", () => {
    const s = withItems(3);
    const before = s.visualItems.map((i) => i.id);
    const reordered = [s.visualItems[2], s.visualItems[0], s.visualItems[1]];
    const s2 = projectReducer(s, {
      type: "set-ordering",
      mode: "shuffled",
      items: reordered,
    });
    expect(s2.orderingMode).toBe("shuffled");
    expect(s2.visualItems.map((i) => i.id)).toEqual([
      before[2],
      before[0],
      before[1],
    ]);
    expect(s2.orderSnapshot).not.toBeNull();
    expect(s2.orderSnapshot?.items.map((i) => i.id)).toEqual(before);
    expect(s2.orderSnapshot?.mode).toBe("manual");
    expect(s2.exportConfirmed).toBe(false);
  });

  it("undo restores the exact previous sequence and mode (one level)", () => {
    const s = withItems(3);
    const before = s.visualItems.map((i) => i.id);
    const s2 = projectReducer(s, {
      type: "set-ordering",
      mode: "name-asc",
      items: [s.visualItems[1], s.visualItems[2], s.visualItems[0]],
    });
    const s3 = projectReducer(s2, { type: "undo-ordering" });
    expect(s3.visualItems.map((i) => i.id)).toEqual(before);
    expect(s3.orderingMode).toBe("manual");
    // only one level: a second undo is a no-op
    expect(s3.orderSnapshot).toBeNull();
    expect(projectReducer(s3, { type: "undo-ordering" })).toBe(s3);
  });

  it("a manual drag switches to manual mode and clears the undo point", () => {
    const s = withItems(3);
    const sorted = projectReducer(s, {
      type: "set-ordering",
      mode: "date-asc",
      items: s.visualItems.slice().reverse(),
    });
    expect(sorted.orderSnapshot).not.toBeNull();
    const dragged = projectReducer(sorted, {
      type: "reorder-visual",
      from: 0,
      to: 2,
    });
    expect(dragged.orderingMode).toBe("manual");
    expect(dragged.orderSnapshot).toBeNull();
  });

  it("uploading new media appends and resets ordering to manual", () => {
    const s = withItems(2);
    const sorted = projectReducer(s, {
      type: "set-ordering",
      mode: "name-desc",
      items: s.visualItems.slice().reverse(),
    });
    const withMore = projectReducer(sorted, {
      type: "add-visual",
      items: [image()],
    });
    expect(withMore.visualItems).toHaveLength(3);
    expect(withMore.orderingMode).toBe("manual");
    expect(withMore.orderSnapshot).toBeNull();
    // existing items kept their (sorted) relative order; new one appended last
    expect(withMore.visualItems.slice(0, 2).map((i) => i.id)).toEqual(
      sorted.visualItems.map((i) => i.id),
    );
  });

  it("removing an item clears a pending undo but keeps the mode", () => {
    const s = withItems(3);
    const sorted = projectReducer(s, {
      type: "set-ordering",
      mode: "date-desc",
      items: s.visualItems.slice().reverse(),
    });
    const removed = projectReducer(sorted, {
      type: "remove-visual",
      id: sorted.visualItems[0].id,
    });
    expect(removed.orderSnapshot).toBeNull();
    expect(removed.orderingMode).toBe("date-desc");
  });
});
