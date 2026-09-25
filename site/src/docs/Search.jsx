/**
 * Search over every page and heading in the docs, opened with ⌘K or
 * Ctrl+K, with /, or from the header's button. The index is a small JSON
 * file written at build, fetched the first time the dialog opens.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../../../studio/src/ui/sound.js';

const BASE = import.meta.env.BASE_URL;
let indexPromise = null;
const loadIndex = () => (indexPromise ??= fetch(`${BASE}docs/search.json`).then((r) => r.json()));

/** Every page and heading as one flat list of results. */
function flatten(pages) {
  return pages.flatMap((p) => [
    { page: p.nav, text: p.title, url: p.url, kind: 'page', hay: `${p.title} ${p.nav} ${p.text}`.toLowerCase() },
    ...p.headings.map((h) => ({ page: p.nav, text: h.text, url: h.url, kind: 'heading', hay: `${h.text} ${p.nav} ${h.body ?? ''}`.toLowerCase() })),
  ]);
}

/** Results for a query: every word must appear; a match in the words themselves ranks above one in the page's name. */
function find(items, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.filter((i) => i.kind === 'page');
  return items
    .filter((i) => words.every((w) => i.hay.includes(w)))
    .map((i) => ({ i, score: (i.text.toLowerCase().startsWith(words[0]) ? 0 : 1) + (words.every((w) => i.text.toLowerCase().includes(w)) ? 0 : 2) + (i.kind === 'page' ? 0 : 0.5) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 12)
    .map((r) => r.i);
}

export function Search() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [at, setAt] = useState(0);
  const input = useRef(null);
  const back = useRef(null);
  const dialog = useRef(null);

  useEffect(() => {
    const show = () => {
      back.current = document.activeElement;
      setOpen(true);
      loadIndex().then((pages) => setItems(flatten(pages)), () => setItems([]));
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      } else if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        show();
      }
    };
    const onClick = (e) => {
      if (e.target.closest('[data-search]')) show();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      sound.select();
      requestAnimationFrame(() => input.current?.select());
    }
    if (!open && d.open) d.close();
  }, [open]);

  const results = useMemo(() => (items ? find(items, q) : []), [items, q]);
  useEffect(() => setAt(0), [q]);

  const close = () => {
    setOpen(false);
    back.current?.focus?.();
  };
  /* Close first, so the dialog handing focus back cannot move the page after the jump. */
  const go = (r) => {
    if (!r) return;
    setOpen(false);
    requestAnimationFrame(() => {
      location.href = r.url;
    });
  };

  return (
    <dialog
      ref={dialog}
      className="search"
      aria-label="Search the docs"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && close()}
    >
      <div className="search-box">
        <div className="search-field">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
          <input
            ref={input}
            type="search"
            value={q}
            placeholder="Search the docs"
            aria-label="Search the docs"
            aria-controls="search-results"
            aria-activedescendant={results[at] ? `sr-${at}` : undefined}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAt((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAt((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[at]);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="search-results" id="search-results" role="listbox" aria-label="Results">
          {items === null && <li className="search-empty">Loading…</li>}
          {items && !results.length && <li className="search-empty">Nothing matches “{q}”. Try a command, like <code>record</code>, or a word, like <code>wash</code>.</li>}
          {results.map((r, i) => (
            <li key={r.url} id={`sr-${i}`} role="option" aria-selected={i === at}>
              <a href={r.url} onPointerEnter={() => setAt(i)} onClick={(e) => {
                e.preventDefault();
                go(r);
              }}>
                <span className="sr-text">{r.text}</span>
                <span className="sr-page">{r.kind === 'page' ? 'Page' : r.page}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
