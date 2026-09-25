/* One icon set, drawn for Dolly: 16px, 1.5 stroke, round joins. */
const paths = {
  play: <path d="M5.5 3.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L6.4 3.3a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="4.5" y="3.5" width="2.4" height="9" rx=".6" fill="currentColor" stroke="none" /><rect x="9.1" y="3.5" width="2.4" height="9" rx=".6" fill="currentColor" stroke="none" /></>,
  undo: <path d="M6 4.5 3.5 7 6 9.5M3.8 7H10a2.75 2.75 0 0 1 0 5.5H8" />,
  redo: <path d="M10 4.5 12.5 7 10 9.5M12.2 7H6a2.75 2.75 0 0 0 0 5.5h2" />,
  frame: <path d="M3 6V4a1 1 0 0 1 1-1h2M10 3h2a1 1 0 0 1 1 1v2M13 10v2a1 1 0 0 1-1 1h-2M6 13H4a1 1 0 0 1-1-1v-2" />,
  back: <path d="M10 4 6 8l4 4" />,
  forward: <path d="m6 4 4 4-4 4" />,
  lean: <><path d="M3 6V4a1 1 0 0 1 1-1h2M10 3h2a1 1 0 0 1 1 1v2M13 10v2a1 1 0 0 1-1 1h-2M6 13H4a1 1 0 0 1-1-1v-2" /><rect x="6" y="6" width="4" height="4" rx=".75" /></>,
  wide: <><rect x="2.5" y="4" width="11" height="8" rx="1.25" /></>,
  wash: <><rect x="2.5" y="4" width="11" height="8" rx="1.25" fill="currentColor" fillOpacity=".18" /><rect x="5.5" y="6" width="5" height="4" rx=".75" /></>,
  chevron: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
  arrow: <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />,
  copy: <><rect x="5.5" y="5.5" width="7" height="7" rx="1.5" /><path d="M10.5 3.5H5A1.5 1.5 0 0 0 3.5 5v5.5" /></>,
  check: <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />,
  sound: <><path d="M3 6.25h1.75L8 3.75v8.5l-3.25-2.5H3a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5Z" /><path d="M10.5 6a2.75 2.75 0 0 1 0 4M12.25 4.25a5.25 5.25 0 0 1 0 7.5" /></>,
  mute: <><path d="M3 6.25h1.75L8 3.75v8.5l-3.25-2.5H3a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5Z" /><path d="m10.5 6.25 3.25 3.5M13.75 6.25l-3.25 3.5" /></>,
};

export function Icon({ name, size = 16, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
