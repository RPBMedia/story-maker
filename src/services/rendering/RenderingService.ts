/**
 * RenderingService — the only module that knows about ffmpeg.wasm.
 *
 * React components never call ffmpeg directly; they talk to this service
 * through render()/cancel(). ffmpeg.wasm 0.12 already executes inside its own
 * Web Worker, so the UI thread stays responsive; if that ever changes (or the
 * work moves to a backend), only this file needs to change.
 *
 * Pipeline:
 *   1. load engine (single-threaded core, bundled locally — no CDN, no
 *      COOP/COEP header requirements)
 *   2. write inputs to the in-memory FS
 *   3. concat audio tracks -> AAC soundtrack (filter_complex concat)
 *   4. render each image into a letterboxed H.264 segment of its allocated
 *      duration
 *   5. normalize each video segment to 1280x720/30fps H.264 (trim / freeze
 *      final frame as the duration plan dictates)
 *   6. concat all segments with the concat demuxer (stream copy — all
 *      segments share identical encoding parameters by construction)
 *   7. mux visuals + soundtrack, hard-capped at the soundtrack duration
 *   8. read output, clean every temporary file
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import type {
  AudioTrack,
  EffectiveTimeline,
  RenderProgress,
  RenderResult,
  RenderSettings,
  RenderStage,
  TimelineSegment,
} from "../../types";
import {
  buildXfadeGraph,
  fadeOutChain,
  needsXfadePath,
  scalePadChain,
  zoomChain,
} from "./filters";
import { xfadeOffsets } from "../../utils/timeline";

export class RenderCancelledError extends Error {
  constructor() {
    super("Render cancelled");
    this.name = "RenderCancelledError";
  }
}

export class RenderFailedError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "RenderFailedError";
    this.detail = detail;
  }
}

interface StageWindow {
  stage: RenderStage;
  from: number;
  to: number;
}

export interface RenderJobInput {
  audioTracks: AudioTrack[];
  timeline: EffectiveTimeline;
  soundtrackDuration: number;
  settings: RenderSettings;
  onProgress: (p: RenderProgress) => void;
}

export class RenderingService {
  private ffmpeg: FFmpeg | null = null;
  private cancelled = false;
  private rendering = false;
  private tempFiles: string[] = [];
  private logTail: string[] = [];

  get isRendering(): boolean {
    return this.rendering;
  }

  cancel(): void {
    if (!this.rendering) return;
    this.cancelled = true;
    // terminate() kills the worker mid-exec; the engine reloads on next use.
    try {
      this.ffmpeg?.terminate();
    } catch {
      /* already gone */
    }
    this.ffmpeg = null;
  }

  async render(job: RenderJobInput): Promise<RenderResult> {
    if (this.rendering) {
      throw new RenderFailedError("A render is already in progress.");
    }
    this.rendering = true;
    this.cancelled = false;
    this.tempFiles = [];
    this.logTail = [];

    try {
      return await this.pipeline(job);
    } finally {
      await this.cleanupTempFiles();
      this.rendering = false;
    }
  }

  // ---- pipeline ------------------------------------------------------------

  private async pipeline(job: RenderJobInput): Promise<RenderResult> {
    const { audioTracks, timeline, soundtrackDuration, settings, onProgress } = job;
    const plan = timeline; // segments carry duration/trimTo like the old plan
    const useXfade = needsXfadePath(timeline);
    const report = (stage: StageWindow, ratio: number) =>
      onProgress({
        stage: stage.stage,
        overall: clamp(stage.from + (stage.to - stage.from) * clamp(ratio)),
      });

    // Stage windows sum to 1; weights reflect observed cost.
    const nImages = plan.segments.filter((s) => s.item.kind === "image").length;
    const nVideos = plan.segments.filter((s) => s.item.kind === "video").length;
    const w = stageWindows(nImages, nVideos);

    report(w.engine, 0);
    await this.loadEngine();
    this.checkCancelled();
    report(w.engine, 1);

    // ---- write inputs
    report(w.write, 0);
    const audioNames: string[] = [];
    for (let i = 0; i < audioTracks.length; i++) {
      const name = `audio_${i}${ext(audioTracks[i].name)}`;
      await this.writeTemp(name, audioTracks[i].file);
      audioNames.push(name);
      this.checkCancelled();
      report(w.write, (i + 1) / (audioTracks.length + plan.segments.length));
    }
    const visualNames: string[] = [];
    for (let i = 0; i < plan.segments.length; i++) {
      const seg = plan.segments[i];
      const name = `visual_${i}${ext(seg.item.name)}`;
      await this.writeTemp(name, seg.item.file);
      visualNames.push(name);
      this.checkCancelled();
      report(
        w.write,
        (audioTracks.length + i + 1) /
          (audioTracks.length + plan.segments.length),
      );
    }

    // ---- soundtrack
    report(w.audio, 0);
    const inputs = audioNames.flatMap((n) => ["-i", n]);
    const concatSpec =
      audioNames.map((_, i) => `[${i}:a]`).join("") +
      `concat=n=${audioNames.length}:v=0:a=1[out]`;
    await this.exec(
      [
        ...inputs,
        "-filter_complex",
        concatSpec,
        "-map",
        "[out]",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "soundtrack.m4a",
      ],
      (r) => report(w.audio, r),
    );
    this.tempFiles.push("soundtrack.m4a");

    // ---- visual segments (uniform encoding so concat can stream-copy and
    //      xfade inputs stay compatible: same size/fps/SAR/pixfmt)
    const scalePad = scalePadChain(settings);
    const segNames: string[] = [];
    let imgDone = 0;
    let vidDone = 0;

    for (let i = 0; i < plan.segments.length; i++) {
      this.checkCancelled();
      const seg = plan.segments[i];
      const out = `seg_${i}.mp4`;
      const isLast = i === plan.segments.length - 1;
      // End-of-video dip to black on the final segment (cross-fade option on).
      const endFade = isLast ? fadeOutChain(timeline.endFade, seg.duration, settings.fps) : null;

      if (seg.item.kind === "image") {
        const zoom = zoomChain(seg.zoom, seg.duration, settings, "image");
        const stage = zoom ? w.zoom : w.images;
        let vf = zoom ? `${scalePad},${zoom}` : scalePad;
        if (endFade) vf = `${vf},${endFade}`;
        devLogSegment(i, seg, vf);
        // With zoom the still is animated from ONE input frame (zoompan d=N),
        // so the supersample upscale runs once — do NOT -loop (that would
        // multiply frames). Without zoom, loop the still for the segment.
        const inputArgs = zoom
          ? ["-i", visualNames[i]]
          : [
              "-loop", "1",
              "-framerate", String(settings.fps),
              "-t", seg.duration.toFixed(3),
              "-i", visualNames[i],
            ];
        const encodeArgs = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"];
        // A static still (no zoom) encodes fastest with the stillimage tune.
        if (!zoom) encodeArgs.push("-tune", "stillimage");
        await this.exec(
          [...inputArgs, "-vf", vf, ...encodeArgs, "-an", out],
          (r) => report(stage, (imgDone + r) / Math.max(nImages, 1)),
        );
        imgDone += 1;
      } else {
        const zoom = zoomChain(seg.zoom, seg.duration, settings, "video");
        const args = ["-i", visualNames[i]];
        // freeze tail: extend the last frame with tpad; trim: cap with -t
        const freeze =
          seg.duration > seg.item.duration + 0.001
            ? seg.duration - seg.item.duration
            : 0;
        let vf =
          freeze > 0
            ? `${scalePad},tpad=stop_mode=clone:stop_duration=${freeze.toFixed(3)}`
            : scalePad;
        if (zoom) vf = `${vf},${zoom}`;
        if (endFade) vf = `${vf},${endFade}`;
        devLogSegment(i, seg, vf);
        args.push("-vf", vf, "-an");
        args.push("-t", seg.duration.toFixed(3));
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", out);
        await this.exec(args, (r) =>
          report(w.videos, (vidDone + r) / Math.max(nVideos, 1)),
        );
        vidDone += 1;
      }
      this.tempFiles.push(out);
      segNames.push(out);
    }

    // ---- build the visual sequence
    if (useXfade) {
      // Cross-fades overlap neighboring segments: chain xfade/concat filters
      // and re-encode the combined timeline (slower, unavoidable).
      report(w.sequence, 0);
      const graph = buildXfadeGraph(timeline);
      devLogGraph(timeline, graph.filter);
      const inputs = segNames.flatMap((n) => ["-i", n]);
      try {
        await this.exec(
          [
            ...inputs,
            "-filter_complex", graph.filter,
            "-map", `[${graph.outLabel}]`,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "visual.mp4",
          ],
          (r) => report({ ...w.sequence, stage: "building-transitions" }, r),
        );
      } catch (e) {
        if (e instanceof RenderFailedError && /xfade/i.test(e.detail ?? "")) {
          throw new RenderFailedError(
            "This rendering engine build does not support cross-fades. Set the transition to None and render again.",
            e.detail,
          );
        }
        throw e;
      }
    } else {
      // No overlaps: fast path, stream-copy concat (identical encodes).
      report(w.sequence, 0);
      const listBody = segNames.map((n) => `file '${n}'`).join("\n");
      await this.writeTemp("segments.txt", new Blob([listBody]));
      await this.exec(
        [
          "-f", "concat",
          "-safe", "0",
          "-i", "segments.txt",
          "-c", "copy",
          "visual.mp4",
        ],
        (r) => report(w.sequence, r),
      );
    }
    this.tempFiles.push("visual.mp4");

    // ---- mux; -t guarantees output never exceeds the soundtrack
    report(w.mux, 0);
    await this.exec(
      [
        "-i", "visual.mp4",
        "-i", "soundtrack.m4a",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "copy",
        "-t", soundtrackDuration.toFixed(3),
        "-movflags", "+faststart",
        "output.mp4",
      ],
      (r) => report(w.mux, r),
    );
    this.tempFiles.push("output.mp4");

    // ---- read output
    report(w.finalize, 0.2);
    const ffmpegRef = this.ffmpegOrThrow();
    const data = await ffmpegRef.readFile("output.mp4");
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    if (bytes.length < 1024) {
      throw new RenderFailedError(
        "Rendering finished but the output looks empty.",
        this.logTail.join("\n"),
      );
    }
    // copy into a fresh ArrayBuffer to detach from wasm memory
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer], { type: "video/mp4" });
    report(w.finalize, 1);

    return {
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      duration: soundtrackDuration,
    };
  }

  // ---- engine / exec helpers ------------------------------------------------

  private async loadEngine(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;
    if (typeof WebAssembly === "undefined") {
      throw new RenderFailedError(
        "This browser does not support WebAssembly, which StoryMaker needs to render video.",
      );
    }
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      this.logTail.push(message);
      if (this.logTail.length > 40) this.logTail.shift();
    });
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(coreURL, "text/javascript"),
        wasmURL: await toBlobURL(wasmURL, "application/wasm"),
      });
    } catch (e) {
      throw new RenderFailedError(
        "The rendering engine could not be loaded. Check your connection and reload the page.",
        String(e),
      );
    }
    this.ffmpeg = ffmpeg;
    return ffmpeg;
  }

  private ffmpegOrThrow(): FFmpeg {
    if (!this.ffmpeg) throw new RenderCancelledError();
    return this.ffmpeg;
  }

  private async writeTemp(name: string, data: File | Blob): Promise<void> {
    const ffmpeg = this.ffmpegOrThrow();
    await ffmpeg.writeFile(name, await fetchFile(data));
    this.tempFiles.push(name);
  }

  private async exec(
    args: string[],
    onRatio: (ratio: number) => void,
  ): Promise<void> {
    this.checkCancelled();
    const ffmpeg = this.ffmpegOrThrow();
    const handler = ({ progress }: { progress: number }) =>
      onRatio(clamp(progress));
    ffmpeg.on("progress", handler);
    try {
      const code = await ffmpeg.exec(args);
      if (code !== 0) {
        if (this.cancelled) throw new RenderCancelledError();
        throw new RenderFailedError(
          "A rendering step failed while processing your media.",
          this.logTail.slice(-12).join("\n"),
        );
      }
    } catch (e) {
      if (this.cancelled || e instanceof RenderCancelledError) {
        throw new RenderCancelledError();
      }
      if (e instanceof RenderFailedError) throw e;
      throw new RenderFailedError(
        "A rendering step failed while processing your media.",
        `${String(e)}\n${this.logTail.slice(-12).join("\n")}`,
      );
    } finally {
      ffmpeg.off("progress", handler);
      onRatio(1);
    }
  }

  private checkCancelled(): void {
    if (this.cancelled) throw new RenderCancelledError();
  }

  private async cleanupTempFiles(): Promise<void> {
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) {
      this.tempFiles = [];
      return;
    }
    for (const name of this.tempFiles) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        // best-effort: a failed delete only leaks in-memory FS space until
        // the worker is terminated/reloaded
      }
    }
    this.tempFiles = [];
  }
}

// ---- helpers ----------------------------------------------------------------

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// ---- dev-only render diagnostics --------------------------------------------
// Visible only in development (import.meta.env.DEV); never surfaced to users.
// Renders the effective zoom/transition, prepared segment durations, the
// generated per-segment filter, xfade offsets, and the final filter graph.

const DEV =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

function devLogSegment(index: number, seg: TimelineSegment, vf: string): void {
  if (!DEV) return;
  console.debug(
    `[render] seg ${index} ${seg.item.kind} "${seg.item.name}" ` +
      `dur=${seg.duration.toFixed(3)}s zoom=${seg.zoom.type}` +
      (seg.zoom.type !== "none" ? `@${seg.zoom.amount}` : "") +
      `\n         filter: ${vf}`,
  );
}

function devLogGraph(timeline: EffectiveTimeline, filter: string): void {
  if (!DEV) return;
  const boundaries = timeline.boundaries
    .map(
      (b) =>
        `after#${b.afterIndex}:${b.type}${b.overlap > 0 ? `(${b.overlap.toFixed(3)}s)` : ""}`,
    )
    .join(" ");
  console.debug(
    `[render] transitions: ${boundaries || "none"}\n` +
      `[render] xfade offsets: ${xfadeOffsets(timeline)
        .map((o) => o.toFixed(3))
        .join(", ")}\n` +
      `[render] final graph: ${filter}`,
  );
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

function stageWindows(nImages: number, nVideos: number) {
  // weights: engine 7%, write 6%, audio 9%, images/videos share 47% by
  // count, sequence/transitions 18%, mux 8%, finalize 5%
  const visualTotal = 0.47;
  const total = Math.max(nImages + nVideos, 1);
  const imgShare = (nImages / total) * visualTotal;
  const vidShare = (nVideos / total) * visualTotal;
  let at = 0;
  const win = (stage: RenderStage, size: number): StageWindow => {
    const s = { stage, from: at, to: at + size };
    at += size;
    return s;
  };
  const engine = win("loading-engine", 0.07);
  const write = win("reading-metadata", 0.06);
  const audio = win("preparing-soundtrack", 0.09);
  const images = win("preparing-images", imgShare);
  const videos = win("normalizing-videos", vidShare);
  const sequence = win("building-sequence", 0.18);
  const mux = win("combining", 0.08);
  const finalize = win("finalizing", 0.05);
  return {
    engine,
    write,
    audio,
    images,
    // zoom shares the image window; only the visible stage label differs
    zoom: { ...images, stage: "applying-zoom" as RenderStage },
    videos,
    sequence,
    mux,
    finalize,
  };
}

/** Singleton used by the app; tests construct their own instances. */
export const renderingService = new RenderingService();
