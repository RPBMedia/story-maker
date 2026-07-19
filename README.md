# StoryMaker

Turn audio tracks, images, and video clips into a single video story — entirely
in your browser. Nothing is uploaded anywhere: rendering happens locally with
WebAssembly FFmpeg.

**Repository:** https://github.com/RPBMedia/story-maker

## What the MVP does

- Upload multiple **MP3/WAV** audio tracks; reorder them; they play back to
  back and define the total video length.
- Upload **JPG/PNG/WebP images and MP4/WebM clips** into one shared, freely
  interleavable sequence (image → video → image → …).
- Automatic duration allocation: videos keep their length, images split the
  remaining time evenly, with trimming / final-frame freezing when the math
  demands it (see *Duration rules* below).
- Review screen with project summary, a proportional sequence bar, warnings
  for large/long projects, and a Generate gate.
- In-browser rendering to **MP4 (H.264 + AAC, 1280×720, 30 fps)** with staged
  progress, cancellation, preview, and download.
- Friendly validation: unsupported types, wrong-stage files, empty files, and
  duplicates (by name+size+mtime, not name alone) are reported, never fatal.

## Technology

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript + Vite |
| State | React Context + `useReducer` (single store, no external dep) |
| Rendering | `ffmpeg.wasm` 0.12 (single-threaded core, bundled locally) |
| Styling | Hand-written modern CSS (custom properties, grid/flex) |
| Tests | Vitest + React Testing Library |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # offline unit + component tests
npm run lint       # oxlint
npm run build      # type-check + production build
npm run preview    # serve the production build
```

## Project structure

```
src/
  app/            shell, global styles
  components/     UploadZone, SortableCard, Notices (shared chrome)
  features/
    audio/        Soundtrack stage
    media/        Visual media stage
    project/      Review stage
    rendering/    Export stage
  hooks/          useDragReorder
  services/
    metadata.ts   browser-native duration/dimension probing
    rendering/    RenderingService — the only module that touches ffmpeg
  state/          projectReducer + ProjectContext (single source of truth)
  types/          all domain models (discriminated unions for media)
  utils/          pure logic: duration allocation, validation, formatting
```

Rendering logic is fully isolated from React: components call
`renderingService.render()/cancel()` and receive typed progress events. If the
work later moves to a dedicated worker or a backend, only
`services/rendering/` changes.

## Rendering pipeline

1. **Load engine** — ffmpeg.wasm single-threaded core, served from the app
   bundle (no CDN; no COOP/COEP header requirements). ffmpeg.wasm runs in its
   own Web Worker, keeping the UI responsive.
2. **Write inputs** to ffmpeg's in-memory filesystem.
3. **Soundtrack** — all audio tracks concatenated via `filter_complex concat`
   into one 44.1 kHz stereo AAC stream.
4. **Image segments** — each image becomes a letterboxed H.264 segment of its
   allocated duration (`scale` + `pad` to 1280×720, `fps=30`, `yuv420p`).
5. **Video segments** — each clip is normalized to the same parameters,
   trimmed when the plan requires, and the final clip gets
   `tpad=stop_mode=clone` when the soundtrack outlasts the visuals.
6. **Concat** — all segments share identical encoding by construction, so the
   concat demuxer stream-copies them (fast, no re-encode).
7. **Mux** — visuals + soundtrack, `-t <soundtrack duration>` guaranteeing the
   output never outruns the audio, `+faststart` for instant playback.
8. **Cleanup** — every temporary file is deleted, success or failure.

### Duration rules

Implemented as a pure function (`src/utils/duration.ts`) with the test suite
as its specification:

- videos keep their source duration where possible;
- images split the time videos leave over, evenly;
- if that leaves less than 1 s per image, images shrink proportionally;
- videos longer than the soundtrack ⇒ the sequence is trimmed at the
  soundtrack endpoint (later items are dropped);
- videos only, ending early ⇒ the last frame freezes until the audio ends;
- the final segment absorbs floating-point drift, so the output always matches
  the soundtrack duration and never exceeds it.

## Why 720p first?

In-browser encoding is CPU- and memory-bound: wasm FFmpeg is single-threaded
here and the whole filesystem lives in RAM (with a 2 GB address-space
ceiling). 1280×720@30 renders reliably at roughly real-time speed on ordinary
hardware; 1080p roughly doubles pixel throughput and memory pressure, turning
"works everywhere" into "works on fast machines with patience."

`RenderSettings` already models width/height/fps, so adding a 1920×1080
option later is a settings-UI change plus a memory warning — no pipeline
changes. Cloud rendering (see roadmap) is the honest path to fast high-res
exports.

## Browser requirements and limitations

- A modern desktop browser with WebAssembly (Chrome, Edge, Firefox, Safari
  16.4+). Desktop is the primary target; upload/setup works on mobile.
- **Memory**: all media plus intermediate files live in browser memory.
  Projects in the hundreds of MB may fail on low-RAM machines — the review
  stage warns above 500 MB and for soundtracks over 10 minutes, but does not
  block.
- **Codecs**: the bundled `@ffmpeg/core` includes libx264 and the native AAC
  encoder, so the MP4/H.264/AAC target is produced for real. Input support
  covers the advertised formats; exotic codecs inside MP4/WebM containers may
  fail metadata probing (the file is rejected with a readable message).
- **Speed**: expect roughly real-time or slower rendering (a 3-minute story
  takes on the order of minutes).

## Known issues

- Cancelling a render terminates the ffmpeg worker; the next render pays the
  engine-load cost again (by design — it guarantees a clean slate).
- Source clips are always re-encoded once during normalization, even when
  they already match the target format (correctness over cleverness in the
  MVP).
- Safari's `HTMLMediaElement` metadata probing is occasionally slow on large
  WebM files.

## Testing

```bash
npm run test
```

34 tests cover: duration allocation (images-only, videos-only, interleaving,
sub-minimum image time, trimming, freeze-tail, rounding drift), reducer
behavior (ordering, removal + URL revocation, render lifecycle,
duplicate-start protection, cancellation, reset), file validation and
duplicate detection, and app-shell behavior (stage navigation, Generate
gating, empty states).

## Roadmap ideas

Transitions, custom image durations, trim controls, text overlays / title
cards, multiple audio layers with volume control, project persistence
(metadata is already separated from `File` handles), undo/redo, timeline
editing, 1080p output, and cloud rendering for long projects.
