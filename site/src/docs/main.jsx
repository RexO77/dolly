/**
 * The docs' pages arrive prerendered; this wakes them up: the theme
 * switch, Copy on every code block, the "On this page" list that follows
 * the reading, the phone menu, search, and the live visuals beside the text.
 */
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../../../studio/src/styles/tokens.css';
import '../styles.css';
import './docs.css';
import { sound } from '../../../studio/src/ui/sound.js';
import { initSound } from '../hooks.js';
import { Search } from './Search.jsx';
import { Visual } from './visuals.jsx';

initSound();

/* ── Theme: Night unless the visitor picked Light ── */
const themeButton = document.querySelector('[data-theme-toggle]');
const showTheme = () => {
  const light = document.documentElement.dataset.theme === 'light';
  themeButton?.setAttribute('aria-pressed', String(light));
  themeButton?.setAttribute('aria-label', light ? 'Light theme: switch to Night' : 'Night theme: switch to Light');
};
showTheme();
themeButton?.addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.classList.add('no-motion');
  root.dataset.theme = next;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-motion')));
  try {
    localStorage.setItem('dolly.theme', next);
  } catch {
    /* A private window: the choice lasts until the tab closes. */
  }
  sound.select();
  showTheme();
});

/* ── Copy on every code block ── */
document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-copy]');
  if (!button) return;
  const text = button.parentElement.querySelector('pre').innerText.replace(/\n$/, '');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  sound.select();
  button.classList.add('done');
  button.setAttribute('aria-label', 'Copied');
  setTimeout(() => {
    button.classList.remove('done');
    button.setAttribute('aria-label', 'Copy the code');
  }, 1500);
});

/* ── On this page: the heading you are reading ── */
const tocLinks = [...document.querySelectorAll('.toc a')];
const headings = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
let ticking = false;
const track = () => {
  ticking = false;
  const line = 120;
  let current = headings[0];
  for (const h of headings) if (h.getBoundingClientRect().top <= line) current = h;
  const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
  if (atEnd) current = headings[headings.length - 1];
  for (const a of tocLinks) {
    const on = current && a.hash === `#${current.id}`;
    if (on) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  }
};
if (headings.length) {
  addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(track);
    }
  }, { passive: true });
  track();
}

/* ── The phone menu ── */
const menu = document.querySelector('[data-menu]');
const setMenu = (open) => {
  document.body.toggleAttribute('data-menu-open', open);
  menu?.setAttribute('aria-expanded', String(open));
};
menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.getElementById('docs-nav')?.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

/* ── Search and the visuals ── */
createRoot(document.getElementById('search-root')).render(<Search />);
for (const el of document.querySelectorAll('[data-visual]')) createRoot(el).render(<Visual name={el.dataset.visual} />);

/* The visuals change the page's height as they mount, which moves a linked heading away from the top: go back to it, unless the reader has scrolled since. */
let moved = false;
for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown']) addEventListener(type, () => (moved = true), { once: true, passive: true });
const toHash = () => {
  if (moved || !location.hash) return;
  document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
};
addEventListener('load', () => {
  toHash();
  setTimeout(toHash, 600);
});

/* The search key, as this machine writes it. */
if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) for (const k of document.querySelectorAll('.mod-k')) k.textContent = 'Ctrl K';
