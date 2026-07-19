# StoryMaker

Turn audio tracks, images, and video clips into a single video story — entirely
in your browser. Nothing is uploaded anywhere: rendering happens locally with
WebAssembly FFmpeg.

**Repository:** https://github.com/RPBMedia/story-maker

## What's new (feature/auth-and-visual-effects)

- **Accounts (Supabase)** — email/password, Google and Apple OAuth, password
  recovery, persistent sessions. The editor stays fully usable without an
  account; only the final export is account-gated.
- **Cross-fade transitions** — project-wide default plus per-item overrides,
  configurable duration (0.2–3 s), real `xfade` rendering in the output with
  overlap-aware duration math (the video still exactly matches the
  soundtrack).
- **Subtle zoom (Ken Burns)** — zoom in/out per project or per item,
  configurable intensity (1–10%), rendered by FFmpeg, no blank borders.
- **Honest render-time expectations** — the Review and Export screens state
  that rendering usually takes around 5–15 minutes, a confirmation step
  summarizes the job, progress shows elapsed time (and a remaining estimate
  only once real progress exists), and the page warns before closing during
  a render.

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
cp .env.example .env    # optional: fill in Supabase to enable accounts
npm run dev             # http://localhost:5173
npm run test            # offline unit + component tests
npm run lint            # oxlint
npm run build           # type-check + production build
npm run preview         # serve the production build
```

Without Supabase configured the editor works fully; account features and
export explain the missing setup instead of breaking.

## Supabase setup (accounts)

1. **Create the project** at https://supabase.com → New project.
2. **Copy credentials**: Project Settings → API → copy the *Project URL* and
   the *anon public* key into `.env` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. The anon key is designed to be
   browser-exposed; the **service-role key must never** appear in this app.
3. **Apply the database migration**: open the SQL editor and run
   `supabase/migrations/0001_profiles.sql`. It creates the `profiles` table,
   a signup trigger, indexes, and Row Level Security policies (users can read
   and update only their own row; `plan` and `export_count` are
   client-immutable).
4. **Email/password auth**: Authentication → Providers → Email — enabled by
   default. Decide whether to require email confirmation (both flows are
   handled by the UI).
5. **Google OAuth**: Authentication → Providers → Google → enable, then
   create an OAuth client in Google Cloud Console (type “Web application”).
   Authorized redirect URI: `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`.
   Paste the client ID + secret into Supabase (the secret lives only there,
   never in this repo).
6. **Apple OAuth**: Authentication → Providers → Apple. Requires an Apple
   Developer account: create a Services ID, key, and team configuration per
   Supabase's Apple guide, with the same Supabase callback URL. Without an
   Apple Developer account this provider cannot be completed — the button is
   implemented and will surface Supabase's configuration error until then.
7. **Allowed redirect URLs**: Authentication → URL Configuration → add your
   dev and production origins (e.g. `http://localhost:5173` and your deploy
   URL). The app always uses the current origin for callbacks — nothing is
   hardcoded.
8. **Troubleshooting OAuth**: a redirect back to a blank page usually means
   the origin is missing from the allow-list; a provider error page means the
   provider's own credentials/redirect URI are wrong; “provider is not
   enabled” means step 5/6 was skipped.

### Account model and honesty about enforcement

Only one rule is enforced today: **you must be signed in to export.** This is
client-side gating for product validation — a determined user can bypass it.
Real quota/subscription enforcement will require a trusted backend
(server-side rendering or signed export jobs). The `profiles` table already
models `plan` and `export_count` as groundwork, protected by RLS, with both
columns immutable from the client.

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

## Rendering time — what to expect

Video generation happens **locally in your browser**. Typically it takes
**around 5–15 minutes** — longer videos, many media files, high-resolution
sources, cross-fades, and zoom effects all add time, and render speed depends
heavily on your device. While rendering: keep the tab open (refreshing or
closing cancels the render), keep the device awake, and expect the progress
bar to move slowly through the encode stages. Browser memory limits can make
very large projects fail — shortening the project or disabling effects helps.
Server-side rendering is the future path for faster, more reliable exports.

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
6. **Effects** — each segment optionally gets a subtle Ken Burns zoom (a
   time-based crop of the composed frame — no blank borders by construction).
   With cross-fades enabled, segments are combined with a chained
   `xfade`/`concat` filter graph whose offsets come from the pure timeline
   module; this path re-encodes the combined timeline (slower). Without
   transitions, the original fast path remains: identical encodes,
   stream-copy concat.
7. **Mux** — visuals + soundtrack, `-t <soundtrack duration>` guaranteeing the
   output never outruns the audio, `+faststart` for instant playback.
8. **Cleanup** — every temporary file is deleted, success or failure.

### Duration rules with transitions

Cross-fades overlap neighboring segments, which would silently shorten the
output. The timeline module therefore allocates against
`soundtrack + Σoverlaps` (iterating to a fixed point, since clamping depends
on durations), so the effective, overlap-subtracted timeline still equals the
soundtrack exactly. A fade may use at most 45% of the shorter neighboring
segment; requested durations are clamped and the UI says so. The final item
never has an outgoing transition.

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
