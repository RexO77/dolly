/*
 * PROTO: three visual directions for the whole Studio, behind the picker
 * from the emil-prototype skill (verbatim; it is harness chrome, not part of
 * the design). Dev only: main.jsx mounts it when import.meta.env.DEV.
 *
 * All three sit in one family (warm paper, cool ink, tonal wells, one tight
 * grotesk) and vary on where the dark sits:
 *   Paper  nowhere: the footage in a grey well, shots as tiles in a well
 *   Stage  under the footage: light chrome, the picture on an ink stage
 *   Night  everywhere, first: the footage is the light in the room
 *
 * Delete this folder and the PROTO block in main.jsx once one is chosen.
 */
import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import './picker.css';
import './directions.css';

const DIRECTIONS = [
  { key: 'paper', label: 'Paper' },
  { key: 'stage', label: 'Stage' },
  { key: 'night', label: 'Night' },
];

/* The directions' type, loaded as a page stylesheet for the prototype. The chosen one ships as vendored woff2, so the Studio works offline. */
const FONTS = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..700&family=DM+Mono:wght@400;500&display=swap';

function useFonts() {
  useEffect(() => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS });
    document.head.append(link);
    return () => link.remove();
  }, []);
}

const initial = () => Math.min(DIRECTIONS.length, Math.max(1, parseInt(new URLSearchParams(location.search).get('v'), 10) || 1)) - 1;

export function Directions({ children }) {
  useFonts();
  const [current, setCurrent] = useState(initial);
  const [mount, setMount] = useState(0);
  const [ready, setReady] = useState(false);
  const highlight = useRef(null);
  const items = useRef([]);

  const move = () => {
    const el = items.current[current];
    if (!el || !highlight.current) return;
    highlight.current.style.width = `${el.offsetWidth}px`;
    highlight.current.style.transform = `translateX(${el.offsetLeft}px)`;
  };

  useLayoutEffect(() => {
    document.documentElement.dataset.direction = DIRECTIONS[current].key;
    const url = new URL(location.href);
    url.searchParams.set('v', current + 1);
    history.replaceState(history.state, '', url);
    move();
  }, [current]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    addEventListener('resize', move);
    return () => removeEventListener('resize', move);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /* The Studio's own sliders take the arrows. */
      if (e.target.closest?.('[role="slider"], [role="spinbutton"]')) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= DIRECTIONS.length) setCurrent(n - 1);
      else if (e.key === 'ArrowRight') setCurrent((c) => (c + 1) % DIRECTIONS.length);
      else if (e.key === 'ArrowLeft') setCurrent((c) => (c - 1 + DIRECTIONS.length) % DIRECTIONS.length);
      else if (e.key === 'r' || e.key === 'R') setMount((m) => m + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {children(`${DIRECTIONS[current].key}-${mount}`)}
      <nav className="proto-picker" aria-label="Prototype variants" data-ready={ready || undefined}>
        <span className="proto-picker-highlight" aria-hidden="true" ref={highlight} />
        {DIRECTIONS.map((d, i) => (
          <button
            key={d.key}
            type="button"
            className="proto-picker-item"
            ref={(el) => { items.current[i] = el; }}
            data-active={i === current || undefined}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => setCurrent(i)}
          >
            {d.label}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => setMount((m) => m + 1)}>↻</button>
      </nav>
    </>
  );
}
