import { describe, expect, it } from "vitest";
import { toPersisted, fromPersisted, hasSavedProject, type RestoredProject } from "./projectStore";
import {
  DEFAULT_AUDIO_CROSSFADE,
  DEFAULT_AUDIO_FADE,
  DEFAULT_END_CARD,
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_TITLE_CARD,
  DEFAULT_TRANSITION,
  DEFAULT_ZOOM,
  type AudioTrack,
  type ImageMediaItem,
  type VideoMediaItem,
} from "../types";

function makeState(): RestoredProject {
  const audioFile = new File([new Blob(["audio-bytes"])], "song.mp3", { type: "audio/mpeg" });
  const imgFile = new File([new Blob(["img-bytes"])], "pic.jpg", { type: "image/jpeg" });
  const vidFile = new File([new Blob(["vid-bytes"])], "clip.mp4", { type: "video/mp4" });
  const audio: AudioTrack = {
    id: "a1", file: audioFile, name: "song.mp3", duration: 90, size: audioFile.size,
    previewUrl: "blob:old-audio",
  };
  const image: ImageMediaItem = {
    id: "v1", file: imgFile, name: "pic.jpg", size: imgFile.size, previewUrl: "blob:old-img",
    createdAt: 1000, dateSource: "embedded-original", kind: "image", width: 1600, height: 900,
  };
  const video: VideoMediaItem = {
    id: "v2", file: vidFile, name: "clip.mp4", size: vidFile.size, previewUrl: "blob:old-vid",
    createdAt: 2000, dateSource: "file-last-modified", kind: "video", width: 1280, height: 720, duration: 12,
  };
  return {
    stage: "review",
    audioTracks: [audio],
    visualItems: [image, video],
    orderingMode: "date-asc",
    settings: { ...DEFAULT_RENDER_SETTINGS, width: 1080, height: 1920 },
    titleCard: DEFAULT_TITLE_CARD,
    endCard: DEFAULT_END_CARD,
    audioCrossfade: DEFAULT_AUDIO_CROSSFADE,
    audioFade: DEFAULT_AUDIO_FADE,
    projectTransition: DEFAULT_TRANSITION,
    projectZoom: DEFAULT_ZOOM,
    effectOverrides: { v1: { transition: null, zoom: null } },
  };
}

describe("project persistence mapping", () => {
  it("round-trips authoring state through toPersisted/fromPersisted", async () => {
    const state = makeState();
    const { snapshot, media } = toPersisted(state);

    // snapshot carries metadata + a media ref per item; bytes are separate
    expect(snapshot.audio.map((a) => a.id)).toEqual(["a1"]);
    expect(snapshot.visuals.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(media.map((m) => m.id).sort()).toEqual(["a1", "v1", "v2"]);

    const blobs = new Map(media.map((m) => [m.id, m.blob]));
    const restored = fromPersisted(snapshot, blobs);

    expect(restored.stage).toBe("review");
    expect(restored.orderingMode).toBe("date-asc");
    expect(restored.settings).toMatchObject({ width: 1080, height: 1920 });
    expect(restored.effectOverrides).toEqual({ v1: { transition: null, zoom: null } });

    // media reconstructed with fresh object URLs and preserved kinds/metadata
    expect(restored.audioTracks[0]).toMatchObject({ id: "a1", name: "song.mp3", duration: 90 });
    expect(restored.audioTracks[0].previewUrl).not.toBe("blob:old-audio");
    const [img, vid] = restored.visualItems;
    expect(img).toMatchObject({ id: "v1", kind: "image", width: 1600, height: 900 });
    expect(vid).toMatchObject({ id: "v2", kind: "video", duration: 12 });
    expect(await restored.visualItems[0].file.text()).toBe("img-bytes");
  });

  it("drops items whose blob is missing rather than crashing", () => {
    const { snapshot } = toPersisted(makeState());
    const restored = fromPersisted(snapshot, new Map()); // no blobs available
    expect(restored.audioTracks).toHaveLength(0);
    expect(restored.visualItems).toHaveLength(0);
  });

  it("treats an empty project as nothing to save", () => {
    const empty = { ...makeState(), audioTracks: [], visualItems: [] };
    expect(hasSavedProject(empty)).toBe(false);
    expect(hasSavedProject(makeState())).toBe(true);
  });
});
