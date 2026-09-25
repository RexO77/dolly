/** The speaker in the bar: every sound in the Studio, on or off, remembered. */
import { useEffect, useState } from 'react';
import { Button } from './controls.jsx';
import { sound } from './sound.js';

export function SoundToggle() {
  const [on, setOn] = useState(sound.enabled);
  useEffect(() => sound.on(setOn), []);
  const label = on ? 'Sounds on: turn them off' : 'Sounds off: turn them on';
  return <Button variant="quiet" icon={on ? 'sound' : 'mute'} aria-label={label} aria-pressed={on} title={label} onClick={() => sound.setEnabled(!on)} />;
}
