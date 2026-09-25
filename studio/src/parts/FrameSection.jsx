/**
 * The frame: the clip shown as a card on a background, flat. While the
 * camera is wide the card sits on the background; as it leans in, the card
 * grows to fill the clip, so the lean feels like travelling up to the
 * screen. Nothing is recorded again: the render draws it.
 */
import { Button, Segmented, Value, Field } from '../ui/controls.jsx';
import { BACKDROPS } from '../../../engine/camera/grammar.mjs';
import { sound } from '../ui/sound.js';

const WHAT = 'Show the clip as a card on a background. It sits back while the camera is wide and fills the clip as it leans in.';
const NAMES = { dusk: 'Dusk', ink: 'Ink', paper: 'Paper', wash: 'Wash' };

export function FrameSection({ clip }) {
  const look = clip.look;
  const settle = () => clip.settle();
  const set = (patch, live) => clip.setFrame(patch, { live });

  if (!look) {
    return (
      <section className="washes frame-section" aria-label="Frame">
        <header className="list-head section-head">
          <div>
            <h2>Frame</h2>
            <p className="list-sub">{`None yet. ${WHAT}`}</p>
          </div>
          <Button size="s" onClick={() => { sound.select(); set({ background: 'dusk' }); }}>Put it in a frame</Button>
        </header>
      </section>
    );
  }

  const background = typeof clip.spec.frame.background === 'string' || !clip.spec.frame.background ? clip.spec.frame.background ?? 'dusk' : 'custom';
  return (
    <section className="washes frame-section" aria-label="Frame">
      <header className="list-head section-head">
        <div>
          <h2>Frame</h2>
          <p className="list-sub">{WHAT}</p>
        </div>
        <Button size="s" variant="danger" onClick={() => clip.removeFrame()}>Remove</Button>
      </header>
      <div className="shot-controls frame-controls">
        <Field label="Background">
          <div className="frame-swatches" role="radiogroup" aria-label="Background">
            {Object.entries(BACKDROPS).map(([key, b]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={background === key}
                className="frame-swatch"
                style={{ background: `linear-gradient(135deg, rgb(${b.from.join(',')}), rgb(${b.to.join(',')}))`, color: b.from[0] > 128 ? 'oklch(0.2 0.006 301)' : 'oklch(0.95 0.004 106)' }}
                onClick={() => {
                  if (background !== key) sound.select();
                  set({ background: key });
                }}
              >
                {NAMES[key]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Window" hint="A plain browser window around the product, so it reads as a real web app.">
          <Segmented size="s" label="Window" value={look.window ? 'on' : 'off'} onChange={(v) => set({ window: v === 'on' })} options={[{ value: 'off', label: 'None' }, { value: 'on', label: 'Browser' }]} />
        </Field>
        <Field label="Card size" hint="How much of the clip the card fills while the camera is wide.">
          <Value label="Card size" value={look.inset} step={0.005} min={0.5} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, live) => set({ inset: Math.round(v * 1000) / 1000 }, live)} onSettle={settle} />
        </Field>
        <Field label="On a lean" hint={look.push ? 'The card grows to fill the clip, so the lean feels like moving in.' : 'The card stays where it is; only the camera leans.'}>
          <Segmented size="s" label="On a lean" value={look.push ? 'grow' : 'stay'} onChange={(v) => set({ push: v === 'grow' })} options={[{ value: 'grow', label: 'Grow to fill' }, { value: 'stay', label: 'Stay put' }]} />
        </Field>
      </div>
    </section>
  );
}
