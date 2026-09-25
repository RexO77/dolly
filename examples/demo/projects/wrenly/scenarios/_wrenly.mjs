/**
 * What the Wrenly clips share: where things are on the page, measured in
 * the page itself. Not a clip (its name starts with _). Each finder runs in
 * the browser, so it is self-contained.
 */

/** Where the hand waits before a take: the project's subtitle, where nothing lights up under it. */
export const REST = { x: 720, y: 136 };

/** The filter chips and the rows they leave, down to the last one showing: what a filter changes. */
export function listRect() {
  const chips = [...document.querySelectorAll('.filters .chip')].map((c) => c.getBoundingClientRect());
  const rows = [...document.querySelectorAll('.group:not(.is-hidden) .collapse:not(.is-hidden) .row')]
    .map((r) => r.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top < innerHeight);
  const last = rows[rows.length - 1];
  const left = chips[0].left - 12;
  const top = chips[0].top - 12;
  /* The titles' text, not their columns, which run the width of the list. */
  const text = [...document.querySelectorAll('.group:not(.is-hidden) .collapse:not(.is-hidden) .row .title')].map((t) => {
    const range = document.createRange();
    range.selectNodeContents(t);
    return range.getBoundingClientRect().right;
  });
  const right = Math.max(chips[chips.length - 1].right, ...text) + 16;
  return { x: left, y: top, w: right - left, h: last.bottom + 8 - top };
}

/** The open issue's title and its properties: where a status change shows. */
export function statusRect() {
  const title = document.querySelector('#p-title').getBoundingClientRect();
  const props = document.querySelector('#props').getBoundingClientRect();
  const x = Math.min(title.left, props.left) - 14;
  const y = title.top - 12;
  return { x, y, w: Math.max(title.right, props.left + 360) - x + 14, h: props.bottom + 8 - y };
}
