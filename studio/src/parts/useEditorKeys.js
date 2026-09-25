/**
 * The editor's keys. Space plays, comma and full stop step a frame (Shift
 * for ten), F flips to Framing, Up and Down walk the shots, Escape closes
 * the open one; Cmd or Ctrl with Z undoes (with Shift, redoes) and with S
 * saves. Keys typed into a field, or held by a control that takes the
 * arrows, stay with it.
 */
import { useEffect, useRef } from 'react';
import { sound } from '../ui/sound.js';

export function useEditorKeys(state) {
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const onKey = (e) => {
      const { clip, transport, shot, save, select, toggleFraming } = latest.current;
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          clip.redo();
          sound.redo();
        } else {
          clip.undo();
          sound.undo();
        }
      } else if (cmd && e.key === 's') {
        e.preventDefault();
        save();
      } else if (cmd || e.altKey) {
        /* Leave every other shortcut to the browser. */
      } else if (e.key === ' ' && !e.target.closest('button')) {
        e.preventDefault();
        if (transport.playing) sound.pause();
        else sound.play();
        transport.toggle();
      } else if (e.key === ',' || e.key === '.') {
        transport.step((e.key === ',' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFraming();
      } else if (e.key === 'Escape') {
        select(null);
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.target.closest('[role="slider"], [role="spinbutton"]')) {
        e.preventDefault();
        const shots = clip.shots;
        const i = shot ? shots.findIndex((x) => x.id === shot.id) : -1;
        select(shots[Math.max(0, Math.min(shots.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
