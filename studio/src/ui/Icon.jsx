/* One icon set, drawn for Dolly: 16px, 1.5 stroke, round joins. */
const paths = {
  play: <path d="M5.5 3.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L6.4 3.3a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="4.5" y="3.5" width="2.4" height="9" rx=".6" fill="currentColor" stroke="none" /><rect x="9.1" y="3.5" width="2.4" height="9" rx=".6" fill="currentColor" stroke="none" /></>,
  undo: <path d="M6 4.5 3.5 7 6 9.5M3.8 7H10a2.75 2.75 0 0 1 0 5.5H8" />,
  redo: <path d="M10 4.5 12.5 7 10 9.5M12.2 7H6a2.75 2.75 0 0 0 0 5.5h2" />,
  loop: <path d="M11.5 3.5 13 5l-1.5 1.5M13 5H6.5A3 3 0 0 0 3.5 8M4.5 12.5 3 11l1.5-1.5M3 11h6.5a3 3 0 0 0 3-3" />,
  frame: <path d="M3 6V4a1 1 0 0 1 1-1h2M10 3h2a1 1 0 0 1 1 1v2M13 10v2a1 1 0 0 1-1 1h-2M6 13H4a1 1 0 0 1-1-1v-2" />,
  back: <path d="M10 4 6 8l4 4" />,
  forward: <path d="m6 4 4 4-4 4" />,
  close: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  lean: <><path d="M3 6V4a1 1 0 0 1 1-1h2M10 3h2a1 1 0 0 1 1 1v2M13 10v2a1 1 0 0 1-1 1h-2M6 13H4a1 1 0 0 1-1-1v-2" /><rect x="6" y="6" width="4" height="4" rx=".75" /></>,
  wide: <><rect x="2.5" y="4" width="11" height="8" rx="1.25" /></>,
  wash: <><rect x="2.5" y="4" width="11" height="8" rx="1.25" fill="currentColor" fillOpacity=".18" /><rect x="5.5" y="6" width="5" height="4" rx=".75" /></>,
  fix: <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />,
  chevron: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
};

export function Icon({ name, size = 16, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
