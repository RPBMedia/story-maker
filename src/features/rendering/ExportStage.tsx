import { useEffect, useRef, useState } from "react";
import { useProject } from "../../state/ProjectContext";
import { useAuth } from "../auth/AuthContext";
import { usePlan } from "../plan/PlanContext";
import { entitlementsFor } from "../../services/entitlements";
import { startCheckout } from "../../services/billing";
import { AccountGateModal } from "../auth/AccountGateModal";
import { AccountUnavailableNotice } from "../auth/AuthForms";
import { evaluateExportPermission } from "../../services/exportPolicy";
import { analytics } from "../../services/analytics";
import {
  renderingService,
  RenderCancelledError,
  RenderFailedError,
} from "../../services/rendering/RenderingService";
import { RENDER_STAGE_LABELS, DEFAULT_RENDER_SETTINGS } from "../../types";
import { crossfadePerPairSeconds } from "../../state/projectReducer";
import { aspectPresets, aspectOf } from "../../services/aspect";
import { formatBytes, formatDuration } from "../../utils/format";
import { RenderTimeInfo } from "../../components/RenderTimeInfo";
import {
  estimateInputFromTimeline,
  estimateRenderTime,
  estimateRemainingMs,
  formatMs,
} from "../../utils/renderEstimate";

export function ExportStage() {
  const { state, dispatch, timeline, soundtrackDuration, isValid } =
    useProject();
  const { auth, reloadProfile } = useAuth();
  const { entitlements, isGod } = usePlan();
  const [detailOpen, setDetailOpen] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState<
    "creator" | "professional" | null
  >(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const { renderStatus, renderProgress, result, error } = state;
  const rendering = renderStatus === "rendering";
  // Gate on the current plan's entitlements (duration limit etc.).
  const permission = evaluateExportPermission(auth, entitlements, timeline.total);

  const estimate =
    timeline.segments.length > 0
      ? estimateRenderTime(
          estimateInputFromTimeline(
            soundtrackDuration,
            timeline,
            state.settings.width * state.settings.height,
          ),
        )
      : null;

  const aspects = aspectPresets(entitlements.maxResolution);
  const currentAspect = aspectOf(state.settings);

  // One-time default: if the user hasn't picked an aspect (settings still at the
  // bare default) and their plan allows a higher resolution, adopt the plan's
  // landscape preset so paid plans export at full quality by default. Never
  // overrides a manual choice — it only fires once, and only when untouched.
  const aspectSyncedRef = useRef(false);
  useEffect(() => {
    if (aspectSyncedRef.current) return;
    const s = state.settings;
    const untouched =
      s.width === DEFAULT_RENDER_SETTINGS.width &&
      s.height === DEFAULT_RENDER_SETTINGS.height;
    if (untouched) {
      const landscape = aspects[0];
      if (landscape.width !== s.width || landscape.height !== s.height) {
        dispatch({
          type: "set-render-settings",
          settings: { width: landscape.width, height: landscape.height },
        });
      }
    }
    aspectSyncedRef.current = true;
  }, [aspects, state.settings, dispatch]);

  // elapsed-time ticker
  useEffect(() => {
    if (!rendering) return;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [rendering]);

  // page-close protection while rendering only
  useEffect(() => {
    if (!rendering) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set; the browser shows its own copy.
      e.returnValue =
        "Leaving this page will cancel the render in progress.";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [rendering]);

  const remainingMs = rendering
    ? estimateRemainingMs(elapsedMs, renderProgress.overall)
    : null;

  async function startRender() {
    if (rendering || !isValid) return;
    dispatch({ type: "render-started" });
    analytics.track("export_started", {
      transitions: timeline.boundaries.some((b) => b.overlap > 0),
      zoom: timeline.segments.some((s) => s.zoom.type !== "none"),
    });
    const t0 = Date.now();
    try {
      const res = await renderingService.render({
        audioTracks: state.audioTracks,
        timeline,
        soundtrackDuration,
        settings: state.settings,
        audioCrossfadeSeconds: crossfadePerPairSeconds(state),
        onProgress: (progress) =>
          dispatch({ type: "render-progress", progress }),
      });
      setLastRenderMs(Date.now() - t0);
      analytics.track("export_completed", {
        elapsedSec: Math.round((Date.now() - t0) / 1000),
      });
      dispatch({ type: "render-succeeded", result: res });
    } catch (e) {
      if (e instanceof RenderCancelledError) {
        analytics.track("render_cancelled");
        dispatch({ type: "render-cancelled" });
        return;
      }
      analytics.track("export_failed");
      dispatch({
        type: "render-failed",
        error: {
          message:
            e instanceof RenderFailedError
              ? e.message
              : "Rendering failed unexpectedly.",
          detail: e instanceof RenderFailedError ? e.detail : String(e),
          projectIntact: true,
        },
      });
    }
  }

  async function beginUpgrade(plan: "creator" | "professional") {
    setUpgradeError(null);
    setUpgradeNotice(null);
    setUpgradeBusy(plan);
    try {
      // Checkout runs in a popup, so this tab (and the in-progress project)
      // stays alive and resolves with the outcome when the popup closes.
      const outcome = await startCheckout(plan);
      if (outcome === "redirect") return; // popup blocked → navigating away
      if (outcome === "cancelled") {
        setUpgradeBusy(null);
        return;
      }
      // Paid. The webhook grants the plan server-side; poll the profile until
      // it lands, then the export unlocks right here — no lost work.
      analytics.track("checkout_succeeded", { plan });
      setUpgradeNotice("Payment received — unlocking your plan…");
      for (const ms of [0, 1500, 3000, 5000]) {
        if (ms) await new Promise((r) => setTimeout(r, ms));
        await reloadProfile();
      }
      setUpgradeBusy(null);
      setUpgradeNotice("You're all set — your plan is active. You can export now.");
    } catch (e) {
      setUpgradeBusy(null);
      setUpgradeError(
        e instanceof Error ? e.message : "Could not start checkout.",
      );
    }
  }

  function onGenerateClick() {
    analytics.track("export_attempted");
    // Loading and unavailable are not actionable from this button — loading
    // resolves on its own within moments, and unavailable has its own Retry
    // affordance in the notice above. Only authentication-required routes
    // through this click.
    if (auth.status === "loading" || permission.status === "unavailable") {
      return;
    }
    if (permission.status === "authentication-required") {
      setGateOpen(true);
      return;
    }
    if (permission.status !== "allowed") return; // future statuses: no-op for now
    if (!state.exportConfirmed) return; // confirmation panel handles start
    void startRender();
  }

  function confirmAndStart() {
    dispatch({ type: "confirm-export" });
    void startRender();
  }

  function resetProject() {
    const hasContent =
      state.audioTracks.length > 0 || state.visualItems.length > 0;
    if (
      hasContent &&
      !window.confirm(
        "Reset the project? All uploaded tracks and media will be removed from this session.",
      )
    ) {
      return;
    }
    renderingService.cancel();
    setLastRenderMs(null);
    dispatch({ type: "reset-project" });
  }

  const pct = Math.round(renderProgress.overall * 100);
  const showConfirmation =
    !rendering &&
    !result &&
    isValid &&
    permission.status === "allowed" &&
    !state.exportConfirmed;

  const activeTransitions = timeline.boundaries.filter(
    (b) => b.overlap > 0,
  ).length;
  const zoomedItems = timeline.segments.filter(
    (s) => s.zoom.type !== "none",
  ).length;

  const generateDisabled =
    !isValid ||
    auth.status === "loading" ||
    permission.status === "unavailable" ||
    permission.status === "payment-required";
  const generateLabel =
    isValid && auth.status === "loading" ? "Checking your account…" : "Generate Video";

  return (
    <section aria-labelledby="export-title">
      <header className="stage-header">
        <div>
          <h2 id="export-title">Export</h2>
          <p className="stage-sub">
            Rendering happens entirely in your browser — nothing is uploaded
            anywhere.
          </p>
        </div>
      </header>

      {!rendering && !result && (
        <>
          <RenderTimeInfo estimate={estimate} />

          <div className="card export-format">
            <h3 className="section-title">Format</h3>
            <p className="stage-sub">
              Choose the shape for where you'll share it — the video renders to
              this frame.
            </p>
            <div
              className="aspect-options"
              role="radiogroup"
              aria-label="Output aspect ratio"
            >
              {aspects.map((a) => {
                const active = currentAspect === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`aspect-option${active ? " aspect-option--active" : ""}`}
                    onClick={() =>
                      dispatch({
                        type: "set-render-settings",
                        settings: { width: a.width, height: a.height },
                      })
                    }
                  >
                    <span
                      className={`aspect-swatch aspect-swatch--${a.id.replace(":", "-")}`}
                      aria-hidden="true"
                    />
                    <span className="aspect-option__label">{a.label}</span>
                    <span className="aspect-option__hint">{a.hint}</span>
                    <span className="aspect-option__dims">
                      {a.width}×{a.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {timeline.segments.length > 0 && (
            <div className="card export-summary">
              <h3 className="section-title">Project summary</h3>
              <dl className="confirm-grid">
                <div>
                  <dt>Output duration</dt>
                  <dd>{formatDuration(timeline.total)}</dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>
                    {state.settings.width}×{state.settings.height} ·{" "}
                    {state.settings.fps} fps
                  </dd>
                </div>
                <div>
                  <dt>Visual items</dt>
                  <dd>{timeline.segments.length}</dd>
                </div>
                <div>
                  <dt>Cross-fades</dt>
                  <dd>{activeTransitions > 0 ? `${activeTransitions} enabled` : "off"}</dd>
                </div>
                <div>
                  <dt>Subtle zoom</dt>
                  <dd>{zoomedItems > 0 ? `${zoomedItems} item(s)` : "off"}</dd>
                </div>
                <div>
                  <dt>Expected time</dt>
                  <dd>{estimate?.label ?? "around 5–15 minutes"}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Authentication-state notice: a separate, calm concern from
              render-time guidance above — never combined, never styled as
              a warning/error for the normal signed-out state. */}
          {permission.status === "unavailable" && (
            <AccountUnavailableNotice message={permission.message} />
          )}
          {permission.status === "authentication-required" && isValid && (
            <div className="account-notice" role="status">
              <span className="account-notice__icon" aria-hidden="true">
                🔐
              </span>
              <p className="account-notice__title">
                Sign in or create a free account to render and download this
                video.
              </p>
            </div>
          )}
          {permission.status === "allowed" && (
            <div className="account-notice account-notice--ready" role="status">
              <span className="account-notice__icon" aria-hidden="true">
                ✓
              </span>
              <p className="account-notice__title">
                Signed in as {auth.email}. Your video is ready to render.
              </p>
            </div>
          )}
          {permission.status === "payment-required" &&
            permission.reason === "duration-limit" && (
              <div className="upgrade-notice" role="status">
                <div className="upgrade-notice__head">
                  <span className="upgrade-notice__icon" aria-hidden="true">
                    ✦
                  </span>
                  <p className="upgrade-notice__title">
                    Your <strong>{entitlements.label}</strong> plan exports
                    videos up to{" "}
                    <strong>{formatDuration(permission.thresholdSeconds)}</strong>
                    . This one is{" "}
                    <strong>
                      {formatDuration(permission.projectDurationSeconds)}
                    </strong>
                    .
                  </p>
                </div>
                <div className="upgrade-notice__plans">
                  {(["creator", "professional"] as const)
                    .map((p) => entitlementsFor(p))
                    .filter(
                      (e) =>
                        e.maxProjectDurationSeconds === null ||
                        e.maxProjectDurationSeconds >
                          (permission.thresholdSeconds ?? 0),
                    )
                    .map((e) => (
                      <button
                        key={e.plan}
                        type="button"
                        className={`btn ${e.plan === "creator" ? "btn--primary" : ""} upgrade-notice__plan`}
                        disabled={upgradeBusy !== null}
                        onClick={() => beginUpgrade(e.plan as "creator" | "professional")}
                      >
                        {upgradeBusy === e.plan
                          ? "Opening checkout…"
                          : `Upgrade to ${e.label} — $${e.priceMonthly}/mo`}
                        <span className="upgrade-notice__plan-note">
                          {e.maxProjectDurationSeconds === null
                            ? "unlimited length"
                            : `up to ${formatDuration(e.maxProjectDurationSeconds)}`}
                        </span>
                      </button>
                    ))}
                </div>
                {upgradeError && (
                  <p className="warning-inline" role="alert">
                    {upgradeError}
                  </p>
                )}
                {upgradeNotice && (
                  <p className="upgrade-notice__status" role="status">
                    {upgradeNotice}
                  </p>
                )}
                <p className="upgrade-notice__hint">
                  {isGod
                    ? "God mode (dev): switch plans from the account menu to test any tier — no payment."
                    : "Secure checkout by Stripe. Cancel anytime from Account."}
                </p>
              </div>
            )}

          {showConfirmation ? (
            <div className="confirm-panel card">
              <h3 className="section-title">Ready to render?</h3>
              <p className="stage-sub">
                This usually takes {estimate?.label ?? "around 5–15 minutes"}.
              </p>
              <div className="result__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--large"
                  onClick={confirmAndStart}
                >
                  Start Rendering
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => window.history.back()}
                >
                  Go Back
                </button>
              </div>
            </div>
          ) : (
            <div className="export-launch">
              <button
                type="button"
                className="btn btn--primary btn--large"
                disabled={generateDisabled}
                onClick={onGenerateClick}
              >
                {generateLabel}
              </button>
              {!isValid && (
                <p className="warning-inline" role="note">
                  Add at least one audio track and one visual item first.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {rendering && (
        <div className="render-progress" role="status" aria-live="polite">
          {/* Gradient progress ring; r=80 → circumference 2π·80 ≈ 502.65 */}
          <div
            className="progress-ring"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Render progress"
          >
            <svg viewBox="0 0 180 180" aria-hidden="true">
              <defs>
                <linearGradient id="progress-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6d8dff" />
                  <stop offset="1" stopColor="#9a7bff" />
                </linearGradient>
              </defs>
              <circle className="progress-ring__track" cx="90" cy="90" r="80" />
              <circle
                className="progress-ring__bar"
                cx="90"
                cy="90"
                r="80"
                strokeDasharray={502.65}
                strokeDashoffset={502.65 * (1 - pct / 100)}
              />
            </svg>
            <div className="progress-ring__center">
              <span className="progress-ring__pct">
                {pct}
                <span>%</span>
              </span>
            </div>
          </div>
          <div className="render-progress__head">
            <span className="render-progress__stage">
              {RENDER_STAGE_LABELS[renderProgress.stage]}
            </span>
          </div>
          <div className="render-progress__timing">
            <span>Elapsed: {formatMs(elapsedMs)}</span>
            {remainingMs !== null && (
              <span>· roughly {formatMs(remainingMs)} left</span>
            )}
          </div>
          <p className="render-progress__hint">
            Rendering is still in progress — longer projects can take 5–15
            minutes. Keep this tab open and your device awake; refreshing or
            closing the page cancels the render.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => renderingService.cancel()}
          >
            Cancel render
          </button>
        </div>
      )}

      {renderStatus === "cancelled" && !rendering && (
        <div className="warnings" role="note">
          <strong>Render cancelled.</strong> Your project is untouched — you
          can generate again whenever you're ready.
        </div>
      )}

      {error && renderStatus === "error" && (
        <div className="blockers" role="alert">
          <strong>{error.message}</strong>
          <p>
            Rendering can take several minutes, and this one didn't make it.{" "}
            {error.projectIntact
              ? "Your uploaded project is still intact — you can simply try again."
              : "Please re-check your uploaded files."}{" "}
            If it fails repeatedly, try a shorter project, fewer or smaller
            media files, or disabling cross-fades and zoom — memory limits are
            the most common cause in the browser.
          </p>
          {error.detail && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDetailOpen((v) => !v)}
              >
                {detailOpen ? "Hide" : "Show"} technical details
              </button>
              {detailOpen && <pre className="error-detail">{error.detail}</pre>}
            </>
          )}
        </div>
      )}

      {result && (
        <div className="result">
          <p className="result__done" role="status">
            <strong>Rendering complete</strong>
            {lastRenderMs !== null && <> — finished in {formatMs(lastRenderMs)}</>}.
          </p>
          <video
            className="result__player"
            src={result.url}
            controls
            playsInline
            aria-label="Generated video preview"
          />
          <div className="result__meta">
            <span>
              <strong>{formatDuration(result.duration)}</strong> ·{" "}
              {formatBytes(result.size)} · MP4 (H.264/AAC)
            </span>
          </div>
          <div className="result__actions">
            <a
              className="btn btn--primary btn--large"
              href={result.url}
              download="storymaker.mp4"
            >
              Download MP4
            </a>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void startRender()}
            >
              Render again
            </button>
          </div>
        </div>
      )}

      <div className="stage-actions stage-actions--footer">
        <button type="button" className="btn btn--ghost" onClick={resetProject}>
          Reset project
        </button>
      </div>

      {/*
        No `pendingAction`/returnTo state is needed here: this gate only ever
        opens FROM the Export screen and is modal (not a route change), so
        the project state and the Export screen are never left. Once auth
        flips to "allowed" the permission check above re-evaluates on the
        very next render and the confirmation panel appears automatically —
        rendering still requires the explicit "Start Rendering" click, so
        signing in never silently kicks off a multi-minute render.
      */}
      <AccountGateModal open={gateOpen} onClose={() => setGateOpen(false)} />
    </section>
  );
}
