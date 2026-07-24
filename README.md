# StoryMaker

Turn audio tracks, images, and video clips into a single video story — entirely
in your browser. Nothing is uploaded anywhere: rendering happens locally with
WebAssembly FFmpeg.

**Repository:** https://github.com/RPBMedia/story-maker

## What's new (feature/auth-export-flow)

- **Account entry points from the first screen** — the header shows Sign in /
  Create account immediately, not just at export time.
- **Export is never a dead end** — the Generate Video button stays actionable
  for signed-out users (it opens the account gate) and even when Supabase
  isn't configured at all (a calm notice with a Retry action replaces the old
  disabled button + raw technical warning).
- **Accounts (Supabase)** — email/password, Google and Apple OAuth, password
  recovery, persistent sessions, all through a single `AuthContext`. The
  editor stays fully usable without an account; only the final export is
  account-gated, decided by a central, extensible export policy.
- **Future-ready export policy** — `evaluateExportPermission` already models
  `payment-required` for a future 10-minute free-export limit
  (`FREE_EXPORT_DURATION_LIMIT_SECONDS`), inert until enforcement is
  explicitly enabled. No payments are integrated yet.
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

StoryMaker works fully as an editor with **zero** Supabase setup — uploading,
reordering, effects, and Review are never gated. Without `.env`, the app
degrades gracefully: the header still shows Sign in / Create account, and the
Export screen shows a calm "account services are temporarily unavailable"
notice with a Retry button instead of a raw configuration error. Set up
Supabase when you want to actually test sign-up, sign-in, and export.

1. **Create the project** at https://supabase.com → New project.
2. **Copy credentials**: Project Settings → API → copy the *Project URL* and
   the *anon public* key into `.env` (copy `.env.example` first):
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
   The anon key is designed to be browser-exposed (Row Level Security is what
   actually protects data); the **service-role key must never** appear
   anywhere in this app or repo.
3. **Apply the database migration**: open the SQL editor and run
   `supabase/migrations/0001_profiles.sql`. It creates the `profiles` table,
   a signup trigger, indexes, and Row Level Security policies (users can read
   and update only their own row; `plan` and `export_count` are
   client-immutable — see *Export authorization* below).
4. **Email/password auth**: Authentication → Providers → Email — enabled by
   default.
   - **Email confirmation**: Authentication → Providers → Email → "Confirm
     email" toggle. If ON, `signUpWithPassword` returns no session and the
     sign-up form shows "check your inbox" copy instead of signing the user
     in immediately — both paths are implemented, so either setting works
     without further changes.
5. **Google OAuth**: Authentication → Providers → Google → enable, then
   create an OAuth client in Google Cloud Console (type "Web application").
   Authorized redirect URI: `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`.
   Paste the client ID + secret into Supabase (the secret lives only there,
   never in this repo).
6. **Apple OAuth**: Authentication → Providers → Apple. **Requires an Apple
   Developer Program account** (paid): create a Services ID, a Sign in with
   Apple key, and the team/key IDs per
   [Supabase's Apple guide](https://supabase.com/docs/guides/auth/social-login/auth-apple),
   using the same Supabase callback URL as Google above. Without an Apple
   Developer account this provider cannot be completed — the button is fully
   implemented and will surface Supabase's own "provider not enabled" error
   until Apple is configured; nothing is faked.
7. **Callback / redirect URLs** — local and production:
   - Authentication → URL Configuration → **Redirect URLs**: add a wildcard
     entry for every origin you'll run the app from so all app paths (the
     OAuth popup callback at `/auth/popup-callback` and the password-reset
     page at `/auth/reset-password`) are allowed:
     ```
     http://localhost:5173/**
     https://your-deployed-domain.com/**
     ```
     A bare origin like `http://localhost:5173` only matches the root path,
     which would break the popup callback — use the `/**` wildcard. The app
     never hardcodes `localhost` — `authRedirectUrl()` in `src/config/env.ts`
     always builds redirects from `window.location.origin`, so the same code
     works in every environment as long as the origin is allow-listed here.
   - **Password reset redirect**: handled automatically — `requestPasswordReset`
     sends the user to `<your-origin>/auth/reset-password`; make sure that
     origin is in the Redirect URLs list too (it's covered by the same-origin
     entries above, no separate configuration needed).
8. **Testing authentication locally**:
   - `npm run dev`, open http://localhost:5173.
   - Try **Create account** with a real email you can check (or disable email
     confirmation in step 4 for faster local iteration).
   - Try **Sign in**, **Forgot password** (check your inbox for the reset
     link, which opens `/auth/reset-password` on the same origin), and
     **Sign out** from the header account menu.
   - Google/Apple require their provider setup (steps 5–6) to actually
     complete; until then they will show a clear "this sign-in method isn't
     configured yet" error rather than hanging or crashing.
9. **Troubleshooting OAuth**: a redirect back to a blank/broken page usually
   means the origin is missing from the Redirect URLs allow-list (step 7); a
   provider-hosted error page means the provider's own client ID/secret or
   redirect URI is wrong; "provider is not enabled" means step 5/6 was
   skipped in the Supabase dashboard.

### Account access model

- The **editor is never gated** — soundtrack, visual media, effects, and
  Review work fully for anonymous visitors. **Only Export requires an
  account.**
- The header shows **Sign in** / **Create account** from the very first
  screen (not just at export time), so users can authenticate whenever they
  want without being forced to.
- Pressing **Generate Video** while signed out opens an in-place account
  gate — a modal, not a page redirect — so the in-memory project (including
  selected `File` objects) survives the whole sign-in/sign-up flow. Closing
  the gate is always available and never destructive.
- **Google/Apple sign-in runs in a popup window**, not a full-page redirect.
  The popup handles the provider round-trip and closes itself; the main
  window never unloads, so **the entire project (uploaded files, sequence,
  effects) is preserved across OAuth sign-in** — same as email/password. The
  popup lands on `/auth/popup-callback`, which lets Supabase process the
  tokens; the main window then observes the new session via a cross-window
  storage event. If a browser blocks the popup, the user is asked to allow
  popups and retry (no surprise navigation / state loss), with email/password
  always available as a fallback.
- **Avatars**: the display name and avatar come from the live session's OAuth
  metadata (Google's `picture` / `full_name` claims), so they show instantly
  without depending on the `profiles` row. Google avatar images are loaded
  with `referrerPolicy="no-referrer"` (they 403 otherwise) and fall back to
  the user's initial if the image ever fails.

### Export authorization and future monetization groundwork

Export permission is decided in one place, `src/services/exportPolicy.ts`,
not scattered across UI components:

```ts
type ExportPermission =
  | { status: "allowed" }
  | { status: "authentication-required" }
  | { status: "payment-required"; reason: "duration-limit"; thresholdSeconds; projectDurationSeconds }
  | { status: "quota-exceeded" }
  | { status: "unavailable"; message: string };
```

Today, only two outcomes are actually reachable: **signed-in → `allowed`**,
**signed-out → `authentication-required`**. A third, **`unavailable`**, covers
the (non-auth) case where Supabase itself isn't reachable/configured, so it
degrades to a calm message + Retry instead of pretending sign-in would help.

**Prepared but inert:** `FREE_EXPORT_DURATION_LIMIT_SECONDS = 600` and the
`payment-required` / `duration-limit` variant model the future rule "exports
over 10 minutes require a paid plan." `evaluateExportPermission` already
accepts the project's duration and contains the comparison, gated behind an
`ENFORCE_DURATION_LIMIT = false` constant — so wiring up payment later is a
one-line flip plus a UI for the `payment-required` case, not a redesign.
**No payment is enforced today**, at any project length.

The `profiles` table already models `plan` and `export_count` as further
groundwork, protected by Row Level Security, with both columns immutable from
the client (only a trusted backend could change them safely).

**Honesty about enforcement:** this is client-side gating for product
validation, not hardened billing. A determined user can bypass it in
DevTools. Real quota/subscription/duration enforcement will require a
trusted backend — server-side rendering or signed, server-verified export
jobs — before any of this becomes a real paywall.

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

109 tests cover, among other things:

- **Pure logic**: duration allocation (images-only, videos-only,
  interleaving, sub-minimum image time, trimming, freeze-tail, rounding
  drift), the cross-fade timeline (overlap math, clamping, offsets),
  render-time estimation categories, and export-policy decisions.
- **Reducer behavior**: ordering, removal + URL revocation, render
  lifecycle, duplicate-start protection, cancellation, reset, effect
  settings.
- **Authentication and export gating** (`ExportStage.test.tsx`,
  `AccountMenu.test.tsx`): signed-out users get an actionable (never
  disabled-with-no-recourse) Generate Video button; clicking it opens the
  account gate; a genuine sign-in/sign-up transition inside the gate closes
  it and enables Start Rendering; signing out re-locks export; a loading
  session is never treated as signed in; authentication errors and modal
  dismissal both preserve the in-progress project untouched.
- **Configuration handling** (`ExportConfiguration.test.tsx`,
  `AuthForms.test.tsx`, `config/env.test.ts`): a genuinely unconfigured
  Supabase backend never crashes the app, never leaks environment-variable
  names into the primary UI, always offers a Retry action, and still shows
  the DEV-only technical diagnostic where that's actually useful (inside the
  auth forms themselves).
- **Editor access** (`EditorAccess.test.tsx`): every step — Soundtrack,
  Visual media (incl. per-item effect overrides), Review (incl. project-wide
  transition/zoom defaults), and reaching Export — works fully for
  signed-out visitors.

Auth tests use a small reactive mock store (`src/test/helpers.tsx`,
`useSyncExternalStore`-based) shared across every component in a render
tree, so a test can simulate one real sign-in and observe the *same* update
propagate to both the form that triggered it and the screen that was
waiting on it — the same guarantee the real Supabase-backed context gives.

## Roadmap ideas

Payments/subscriptions (the `payment-required` export status and 10-minute
threshold are modeled but inert — see *Export authorization* above), "My
Projects" / usage / account settings pages (menu entries already reserved in
the header), additional transition types (fade-through-black, slide, wipe,
dip-to-white, blur dissolve — the `TransitionType` union is built to grow),
custom image durations, trim controls, text overlays / title cards, multiple
audio layers with volume control, project persistence (metadata is already
separated from `File` handles), undo/redo, timeline editing, 1080p output,
and cloud/server-side rendering for long projects and real quota enforcement.
