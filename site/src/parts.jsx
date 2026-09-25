import { useRef, useState } from 'react';
import { useCopy } from './hooks.js';

function CopyIcons() {
  return (
    <span className="icons" aria-hidden="true">
      <svg className="cp" width="16" height="16" viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      <svg className="ok" width="16" height="16" viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className={`copy${copied ? ' done' : ''}`} aria-label={copied ? 'Copied' : label} onClick={() => copy(text)}>
      <CopyIcons />
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
      <pre aria-label={label}>
        {lines.map(([c, note], i) => (
          <span key={i}>
            <span className="p">$ </span>{c}
            {note && <span className="c">{' '.repeat(width - c.length + 2)}# {note}</span>}
            {i < lines.length - 1 ? '\n' : ''}
          </span>
        ))}
      </pre>
      <CopyButton text={text} label="Copy the commands" />
    </div>
  );
}

/** Tabs with arrow keys, for the install commands. */
export function Tabs({ tabs, label }) {
  const keys = Object.keys(tabs);
  const [on, setOn] = useState(keys[0]);
  const refs = useRef([]);
  const onKey = (e) => {
    const i = keys.indexOf(on);
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next = null;
    if (d) next = keys[(i + d + keys.length) % keys.length];
    if (e.key === 'Home') next = keys[0];
    if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    setOn(next);
    refs.current[keys.indexOf(next)]?.focus();
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {keys.map((k, i) => (
          <button
            key={k}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-controls={`panel-${k}`}
            aria-selected={on === k}
            tabIndex={on === k ? 0 : -1}
            onClick={() => setOn(k)}
          >
            {k}
          </button>
        ))}
      </div>
      {keys.map((k) => (
        <div key={k} role="tabpanel" id={`panel-${k}`} aria-labelledby={`tab-${k}`} hidden={on !== k}>
          {tabs[k]}
        </div>
      ))}
    </>
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
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10.5M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

export function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--button)" />
      <g fill="var(--button-ink)">
        <rect x="9" y="8.5" width="11" height="8" rx="2" />
        <path d="M20 11.2 24 9v7l-4-2.2z" />
        <rect x="7" y="18.5" width="18" height="2.6" rx="1.3" />
        <circle cx="11" cy="23.4" r="1.9" />
        <circle cx="21" cy="23.4" r="1.9" />
      </g>
    </svg>
  );
}

/** The dolly: a camera on a cart, riding the track. */
export function Cart() {
  return (
    <svg viewBox="0 0 22 20" aria-hidden="true">
      <rect x="5" y="1" width="9" height="6.5" rx="1.6" fill="currentColor" />
      <path d="M14 3.4 17.5 1.6v5.6L14 5.4z" fill="currentColor" />
      <rect x="2" y="9" width="18" height="2.4" rx="1.2" fill="currentColor" />
      <circle cx="6" cy="14.5" r="2.2" fill="var(--paper)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="14.5" r="2.2" fill="var(--paper)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
