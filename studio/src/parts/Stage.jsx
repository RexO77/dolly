/**
 * The stage: the finished frame as a card turned in 3D over a background,
 * like a product shot. Nothing is recorded again; the render draws it. Each
 * shot tilts its own card (the Tilt control in the shot); this is where the
 * stage itself is set: its background, how big the card sits, how deep the
 * perspective is, and its shadow.
 */
import { Button, Value, Field } from '../ui/controls.jsx';
import { BACKGROUNDS } from '../../../engine/camera/grammar.mjs';
import { sound } from '../ui/sound.js';

const WHAT = 'Turn the clip into a card in 3D over a background, tilted while the camera is wide and flat when it leans in. Nothing is recorded again.';
const NAMES = { paper: 'Paper', ink: 'Ink', wash: 'Wash', dusk: 'Dusk' };

export function Stage({ clip }) {
  const stage = clip.stage;
  const settle = () => clip.settle();
  const set = (patch, live) => clip.setStage(patch, { live });

  if (!stage) {
    return (
      <section className="washes stage-section" aria-label="Stage">
        <header className="list-head section-head">
          <div>
            <h2>Stage</h2>
            <p className="list-sub">{WHAT}</p>
          </div>
        </header>
        <div className="shot-actions stage-start">
          <Button size="s" variant="primary" onClick={() => { sound.fix(); clip.productShot(); }}>Make it a product shot</Button>
          <Button size="s" onClick={() => { sound.select(); set({ background: 'dusk' }); }}>Just the stage</Button>
        </div>
      </section>
    );
  }

  const background = typeof clip.spec.stage.background === 'string' ? clip.spec.stage.background : 'custom';
  return (
    <section className="washes stage-section" aria-label="Stage">
      <header className="list-head section-head">
        <div>
          <h2>Stage</h2>
          <p className="list-sub">Tilt each shot from its own row. Tipped back while wide and flat when it leans in reads best.</p>
        </div>
        <Button size="s" variant="danger" onClick={() => clip.removeStage()}>Remove</Button>
      </header>
      <div className="shot-controls stage-controls">
        <Field label="Background">
          <div className="stage-swatches" role="radiogroup" aria-label="Background">
            {Object.entries(BACKGROUNDS).map(([key, b]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={background === key}
                className="stage-swatch"
                title={NAMES[key]}
                style={{ background: `linear-gradient(135deg, rgb(${b.from.join(',')}), rgb(${b.to.join(',')}))` }}
                onClick={() => {
                  if (background !== key) sound.select();
                  set({ background: key });
                }}
              >
                <span>{NAMES[key]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Card size" hint="How much of the clip the card fills when it is flat.">
          <Value label="Card size" value={stage.inset} step={0.005} min={0.5} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, live) => set({ inset: Math.round(v * 1000) / 1000 }, live)} onSettle={settle} />
        </Field>
        <Field label="Depth" hint="Lower is a stronger perspective, like standing closer.">
          <Value label="Depth" value={stage.perspective} step={10} min={600} max={6000} format={(v) => `${Math.round(v)}`} onChange={(v, live) => set({ perspective: Math.round(v) }, live)} onSettle={settle} />
        </Field>
        <Field label="Shadow">
          <Value label="Shadow" value={stage.shadow.strength} step={0.005} min={0} max={0.8} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, live) => set({ shadow: { ...clip.spec.stage.shadow, strength: Math.round(v * 1000) / 1000 } }, live)} onSettle={settle} />
        </Field>
      </div>
    </section>
  );
}
