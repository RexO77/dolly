/**
 * Render, as one button: while the render runs the button fills like a
 * fuse, and when it lands it throws a few sparks of the wash and says so.
 *
 *   click      label "Rendering 0%", the fuse starts
 *   progress   the fuse fills to the render's progress (400ms linear steps)
 *   landed     label "Rendered" with a check for DONE_MS, sparks fly once
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './controls.jsx';

const DONE_MS = 2400;

const SPARKS = {
  count: 10, // how many are thrown
  reach: [30, 58], // px they travel from the button's centre, nearest and furthest
  squash: 0.45, // the burst is wider than tall, so it stays in a 56px bar
  rim: 0.62, // they start this far out along their path: at the button's edge, not under its label
  spring: { type: 'spring', duration: 0.7, bounce: 0 },
  fade: { duration: 0.7, ease: [0.23, 1, 0.32, 1] },
};

/** Where each spark lands: all round the button, a little uneven so it reads as thrown, not placed. */
const landings = Array.from({ length: SPARKS.count }, (_, i) => {
  const angle = (i / SPARKS.count) * 2 * Math.PI + Math.sin(i * 2.4) * 0.25;
  const reach = SPARKS.reach[0] + (SPARKS.reach[1] - SPARKS.reach[0]) * (0.5 + 0.5 * Math.sin(i * 1.7));
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * SPARKS.squash };
});

function Sparks() {
  return (
    <span className="sparks" aria-hidden="true">
      {landings.map((p, i) => (
        <motion.span
          key={i}
          className="spark"
          initial={{ x: p.x * SPARKS.rim, y: p.y * SPARKS.rim, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0.3, opacity: 0 }}
          transition={{ x: SPARKS.spring, y: SPARKS.spring, scale: SPARKS.fade, opacity: SPARKS.fade }}
        />
      ))}
    </span>
  );
}

/**
 * `progress` is the clip's render progress (0..1), or null when none runs.
 * `onRender` resolves truthy when the render landed, which is when the
 * sparks fly; a failed render just goes back to its label.
 */
export function RenderButton({ progress, onRender, label = 'Render', variant = 'primary', disabled, size = 'm', title }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => setDone(0), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  /* `busy` covers the whole action: the render, then whatever the caller does after it (reading the project again), so the label never flickers back in between. */
  const [busy, setBusy] = useState(false);
  const running = progress !== null;
  const run = async () => {
    if (running || busy) return;
    setDone(0);
    setBusy(true);
    const landed = await onRender();
    setBusy(false);
    if (landed) setDone(Date.now());
  };
  const fuse = running ? Math.max(0.02, progress) : busy ? 1 : null;
  return (
    <span className="render-wrap">
      <Button variant={variant} size={size} className="render-btn" onClick={run} disabled={disabled} aria-busy={running || busy} icon={done ? 'check' : undefined} title={title}>
        <span aria-live="polite">{running ? `Rendering ${Math.round(progress * 100)}%` : busy ? 'Finishing' : done ? 'Rendered' : label}</span>
        {fuse !== null && <span className="render-fuse" style={{ scale: `${fuse} 1` }} />}
      </Button>
      {done > 0 && !reduced && <Sparks key={done} />}
    </span>
  );
}
