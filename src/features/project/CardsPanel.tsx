/** Title & end cards: an intro/outro still with text, shown inside the
 * soundtrack. Fade is available on every plan; zoom (push in/out) is paid. */
import { useProject } from "../../state/ProjectContext";
import { usePlan } from "../plan/PlanContext";
import { analytics } from "../../services/analytics";
import { CARD_LIMITS, type CardSettings, type ZoomEffectType } from "../../types";

type CardKey = "title" | "end";

function CardEditor({
  role,
  card,
  canZoom,
  onChange,
}: {
  role: CardKey;
  card: CardSettings;
  canZoom: boolean;
  onChange: (patch: Partial<CardSettings>) => void;
}) {
  const heading = role === "title" ? "Title card (intro)" : "End card (outro)";
  const placeholder =
    role === "title" ? "Your title…" : "Thanks for watching";
  const zooms: { key: ZoomEffectType; label: string }[] = [
    { key: "none", label: "Off" },
    { key: "zoom-in", label: "Zoom in" },
    { key: "zoom-out", label: "Zoom out" },
  ];

  return (
    <div className="card-editor">
      <label className="card-enable">
        <input
          type="checkbox"
          checked={card.enabled}
          onChange={(e) => {
            onChange({ enabled: e.target.checked });
            if (e.target.checked) analytics.track("card_enabled", { role });
          }}
        />
        <span>{heading}</span>
      </label>

      {card.enabled && (
        <div className="effects-grid">
          <div className="effects-field">
            <label className="effects-label" htmlFor={`${role}-card-text`}>
              Text
            </label>
            <input
              id={`${role}-card-text`}
              className="field-input"
              type="text"
              maxLength={120}
              value={card.text}
              placeholder={placeholder}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </div>

          <div className="effects-field">
            <label className="effects-label" htmlFor={`${role}-card-duration`}>
              Duration: <strong>{card.durationSeconds.toFixed(1)}s</strong>
            </label>
            <input
              id={`${role}-card-duration`}
              type="range"
              min={CARD_LIMITS.minSeconds}
              max={CARD_LIMITS.maxSeconds}
              step={CARD_LIMITS.step}
              value={card.durationSeconds}
              onChange={(e) => onChange({ durationSeconds: Number(e.target.value) })}
            />
          </div>

          <div className="effects-field">
            <span className="effects-label" id={`${role}-card-fade-label`}>
              Fade
            </span>
            <div
              className="segmented"
              role="group"
              aria-labelledby={`${role}-card-fade-label`}
            >
              <button
                type="button"
                className={`segmented__btn${!card.fade ? " segmented__btn--on" : ""}`}
                aria-pressed={!card.fade}
                onClick={() => onChange({ fade: false })}
              >
                Off
              </button>
              <button
                type="button"
                className={`segmented__btn${card.fade ? " segmented__btn--on" : ""}`}
                aria-pressed={card.fade}
                onClick={() => onChange({ fade: true })}
              >
                Fade from black
              </button>
            </div>
          </div>

          <div className="effects-field">
            <span className="effects-label" id={`${role}-card-zoom-label`}>
              Zoom {!canZoom && <span className="paid-tag">Paid</span>}
            </span>
            <div
              className="segmented"
              role="group"
              aria-labelledby={`${role}-card-zoom-label`}
            >
              {zooms.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  className={`segmented__btn${card.zoom === z.key ? " segmented__btn--on" : ""}`}
                  aria-pressed={card.zoom === z.key}
                  disabled={!canZoom && z.key !== "none"}
                  onClick={() => canZoom && onChange({ zoom: z.key })}
                >
                  {z.label}
                </button>
              ))}
            </div>
            {!canZoom && (
              <p className="effects-hint">
                Card zoom is a paid feature — upgrade to add a slow push in or out.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CardsPanel() {
  const { state, dispatch } = useProject();
  const { entitlements } = usePlan();
  const canZoom = entitlements.titleCardZoom;

  return (
    <section className="effects-panel card" aria-labelledby="cards-title">
      <h3 id="cards-title" className="section-title">
        Title &amp; end cards
      </h3>
      <p className="stage-sub">
        Add an intro or outro with your own text. Cards play inside your
        soundtrack, so the video stays the same length as the music.
      </p>

      <CardEditor
        role="title"
        card={state.titleCard}
        canZoom={canZoom}
        onChange={(card) => dispatch({ type: "set-title-card", card })}
      />
      <CardEditor
        role="end"
        card={state.endCard}
        canZoom={canZoom}
        onChange={(card) => dispatch({ type: "set-end-card", card })}
      />
    </section>
  );
}
