import { describe, expect, it } from "vitest";
import { buildSoundtrackFilter } from "./filters";
import {
  crossfadeOverlap,
  crossfadePerPairSeconds,
  soundtrackDuration,
  type ProjectState,
} from "../../state/projectReducer";
import { DEFAULT_AUDIO_CROSSFADE, type AudioTrack } from "../../types";

describe("buildSoundtrackFilter", () => {
  it("passes a single track through untouched", () => {
    expect(buildSoundtrackFilter(1, 1.5)).toBe("[0:a]anull[out]");
  });

  it("hard-concats when cross-fade is off", () => {
    expect(buildSoundtrackFilter(3, 0)).toBe(
      "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
    );
  });

  it("cross-fades two tracks", () => {
    expect(buildSoundtrackFilter(2, 1.5)).toBe(
      "[0:a][1:a]acrossfade=d=1.500:c1=tri:c2=tri[out]",
    );
  });

  it("chains cross-fades across three tracks", () => {
    expect(buildSoundtrackFilter(3, 2)).toBe(
      "[0:a][1:a]acrossfade=d=2.000:c1=tri:c2=tri[axf1];" +
        "[axf1][2:a]acrossfade=d=2.000:c1=tri:c2=tri[out]",
    );
  });

  it("appends soundtrack fade in/out when requested", () => {
    const f = buildSoundtrackFilter(1, 0, { durationSeconds: 1.5, totalSeconds: 30 });
    expect(f).toBe(
      "[0:a]anull[sfmix];[sfmix]afade=t=in:st=0:d=1.500," +
        "afade=t=out:st=28.500:d=1.500[out]",
    );
  });

  it("clamps the fade to half the soundtrack for very short tracks", () => {
    const f = buildSoundtrackFilter(1, 0, { durationSeconds: 3, totalSeconds: 4 });
    expect(f).toContain("afade=t=in:st=0:d=2.000");
    expect(f).toContain("afade=t=out:st=2.000:d=2.000");
  });
});

function track(duration: number): AudioTrack {
  return {
    id: `t${duration}`, file: new File([], "t.mp3"), name: "t.mp3", duration,
    size: 1, previewUrl: "blob:x",
  };
}
const state = (tracks: AudioTrack[], cf = DEFAULT_AUDIO_CROSSFADE) =>
  ({ audioTracks: tracks, audioCrossfade: cf }) as unknown as ProjectState;

describe("cross-fade duration math", () => {
  it("shortens the soundtrack by (N-1)×duration when enabled", () => {
    const s = state([track(10), track(10), track(10)], { enabled: true, durationSeconds: 2 });
    expect(crossfadePerPairSeconds(s)).toBe(2);
    expect(crossfadeOverlap(s)).toBe(4);
    expect(soundtrackDuration(s)).toBe(26);
  });

  it("is a no-op when disabled or with a single track", () => {
    expect(soundtrackDuration(state([track(10), track(10)]))).toBe(20);
    expect(crossfadeOverlap(state([track(10)], { enabled: true, durationSeconds: 3 }))).toBe(0);
  });

  it("clamps the fade below the shortest track", () => {
    const s = state([track(1.5), track(10)], { enabled: true, durationSeconds: 5 });
    expect(crossfadePerPairSeconds(s)).toBeCloseTo(1.4, 5); // 1.5 − 0.1
  });
});
