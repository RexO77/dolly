import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '../../studio/src/ui/Icon.jsx';
import { sound } from '../../studio/src/ui/sound.js';
import { asset, useCopy, useSoundOn } from './hooks.js';

export { Icon };

export function CopyButton({ text, label = 'Copy' }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className={`copy${copied ? ' done' : ''}`} aria-label={copied ? 'Copied' : label} onClick={() => copy(text)}>
      <span className="icons" aria-hidden="true">
        <Icon name="copy" className="cp" />
        <Icon name="check" className="ok" />
      </span>
    </button>
  );
}

/**
 * A command block. Lines are [command, comment?]; the prompt sign and the
 * comments are not copied.
 */
export function Commands({ lines, label }) {
  const text = lines.map(([c]) => c).join('\n');
  const width = Math.max(...lines.map(([c]) => c.length));
  return (
    <div className="code">
      <pre aria-label={label} tabIndex={0}>
        {lines.map(([c, note], i) => (
          <span key={i}>
            <span className="p">$ </span>{c}
            {note && <span className="c">{' '.repeat(width - c.length + 2)}# {note}</span>}
            {i < lines.length - 1 ? '\n' : ''}
          </span>
        ))}
      </pre>
      <CopyButton text={text} label={`Copy: ${label}`} />
    </div>
  );
}

/**
 * One of a few options, as a radio group with arrow keys. The chosen one
 * sits on a pill that slides to it.
 */
export function Seg({ label, value, options, onChange, className = '' }) {
  const id = useId();
  const refs = useRef([]);
  const keys = Object.keys(options);
  const pick = (k) => {
    if (k !== value) sound.select();
    onChange(k);
  };
  const onKey = (e) => {
    const i = keys.indexOf(value);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = keys[(i + d + keys.length) % keys.length];
    pick(next);
    refs.current[keys.indexOf(next)]?.focus();
  };
  return (
    <div className={`seg ${className}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {keys.map((k, i) => (
        <button
          key={k}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          data-value={k}
          aria-checked={value === k}
          tabIndex={value === k ? 0 : -1}
          onClick={() => pick(k)}
        >
          {value === k && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} />}
          <span className="seg-label">{options[k]}</span>
        </button>
      ))}
    </div>
  );
}

/** Tabs with arrow keys, for the install commands. */
export function Tabs({ tabs, label }) {
  const id = useId();
  const keys = Object.keys(tabs);
  const [on, setOn] = useState(keys[0]);
  const refs = useRef([]);
  const choose = (k) => {
    if (k !== on) sound.select();
    setOn(k);
  };
  const onKey = (e) => {
    const i = keys.indexOf(on);
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next = null;
    if (d) next = keys[(i + d + keys.length) % keys.length];
    if (e.key === 'Home') next = keys[0];
    if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    choose(next);
    refs.current[keys.indexOf(next)]?.focus();
  };
  return (
    <>
      <div className="seg tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {keys.map((k, i) => (
          <button
            key={k}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`${id}-tab-${k}`}
            aria-controls={`${id}-panel-${k}`}
            aria-selected={on === k}
            tabIndex={on === k ? 0 : -1}
            onClick={() => choose(k)}
          >
            {on === k && <motion.span layoutId={`tab-${id}`} className="seg-pill" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} />}
            <span className="seg-label">{k}</span>
          </button>
        ))}
      </div>
      {keys.map((k) => (
        <div key={k} role="tabpanel" id={`${id}-panel-${k}`} aria-labelledby={`${id}-tab-${k}`} hidden={on !== k}>
          {tabs[k]}
        </div>
      ))}
    </>
  );
}

/** A switch: a label and a knob, on or off. */
export function Switch({ on, onChange, children, className = '' }) {
  return (
    <button type="button" className={`switch ${className}`} role="switch" aria-checked={on} onClick={() => {
      sound.select();
      onChange(!on);
    }}>
      <span className="knob" aria-hidden="true" />
      {children}
    </button>
  );
}

export function Prompt({ title, text }) {
  return (
    <div className="prompt">
      <h3>{title}</h3>
      <blockquote>{text}</blockquote>
      <CopyButton text={text} label={`Copy the prompt: ${title}`} />
    </div>
  );
}

export function ArrowIcon() {
  return <Icon name="arrow" />;
}

/** Dolly's mark: the crop frame and its lens, in the version for the page's theme. */
export function Mark({ theme }) {
  return <img className="mark-img" src={asset(`icon-${theme}-small.svg`)} alt="" width="28" height="28" />;
}

/** The dolly on its track: a small carriage straddling the rails, its centre the playhead. */
export function Cart() {
  return (
    <svg viewBox="0 0 22 20" aria-hidden="true">
      <rect x="3" y="4" width="16" height="12" rx="4" fill="currentColor" />
      <rect x="10.25" y="7" width="1.5" height="6" rx="0.75" fill="var(--page)" />
    </svg>
  );
}

/**
 * The site's sound: off until the visitor turns it on, and remembered. The
 * words say what pressing it does, so "Turn your sound on" is the invitation.
 */
export function SoundToggle({ big = false }) {
  const on = useSoundOn();
  return (
    <button
      type="button"
      className={`sound-toggle${big ? ' big' : ''}${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => sound.setEnabled(!on)}
    >
      <Icon name={on ? 'sound' : 'mute'} />
      <span className="sound-words">{on ? 'Sound on' : 'Turn your sound on'}</span>
      {on && <span className="bars" aria-hidden="true"><i /><i /><i /></span>}
    </button>
  );
}

export function ThemeToggle({ theme, onChange }) {
  const light = theme === 'light';
  return (
    <button type="button" className="icon-btn" aria-pressed={light} aria-label={light ? 'Light theme: switch to Night' : 'Night theme: switch to Light'} title={light ? 'Switch to Night' : 'Switch to Light'} onClick={() => {
      sound.select();
      onChange(light ? 'dark' : 'light');
    }}>
      {light ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z" /></svg>
      )}
    </button>
  );
}

/** Body copy with `code` in backticks. */
export const withCode = (text) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

/* ─────────────────────────────────────────────────────────
 * THE REEL
 *
 * The footer's length of track, rolling: the directed take's shots pass
 * along it like film through a gate, at one slow constant speed, and the
 * cart rides the rail. The strip is two identical copies, so moving it by
 * one copy's width (-50%) loops without a seam. Decorative, so it is
 * hidden from assistive tech, takes no pointer, pauses off screen and in a
 * hidden tab, and stands still for reduced motion.
 * ───────────────────────────────────────────────────────── */

export function Reel({ frames }) {
  const box = useRef(null);
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    let seen = false;
    const set = () => setPaused(!seen || document.hidden);
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      set();
    });
    io.observe(box.current);
    document.addEventListener('visibilitychange', set);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', set);
    };
  }, []);
  /* Enough frames that one copy is wider than the widest page. */
  const copy = [...frames, ...frames];
  return (
    <div className="reel" ref={box} data-paused={paused || undefined} aria-hidden="true">
      <div className="reel-gate">
        <div className="reel-film">
          {[0, 1].map((k) => (
            <div className="reel-copy" key={k}>
              {copy.map((f, i) => <img key={i} src={f} alt="" width="64" height="40" loading="lazy" decoding="async" />)}
            </div>
          ))}
        </div>
      </div>
      <div className="reel-cart"><Cart /></div>
    </div>
  );
}
