/** Play, step a frame, the clock, the speed, and how sharp the picture is at the playhead. */
import { sharpness } from '../model/picture.js';
import { SOFT_BELOW } from '../../../engine/camera/grammar.mjs';
import { useTime, usePlayback, fmt } from '../hooks.js';
import { Button, Segmented } from '../ui/controls.jsx';
import { sound } from '../ui/sound.js';

export function TransportBar({ clip, transport }) {
  const t = useTime(transport);
  const { playing, rate } = usePlayback(transport);
  const ratio = sharpness(clip, t);
  return (
    <div className="transport">
      <Button variant="quiet" icon={playing ? 'pause' : 'play'} className="btn-play" aria-label={playing ? 'Pause (space)' : 'Play (space)'} title={playing ? 'Pause (space)' : 'Play (space)'} onClick={() => {
        if (transport.playing) sound.pause();
        else sound.play();
        transport.toggle();
      }} />
      <Button variant="quiet" icon="back" aria-label="Back one frame (,)" title="Back one frame (,)" onClick={() => transport.step(-1)} />
      <Button variant="quiet" icon="forward" aria-label="On one frame (.)" title="On one frame (.)" onClick={() => transport.step(1)} />
      <span className="clock"><span className="clock-now">{fmt(t)}</span><span className="clock-len"> / {fmt(clip.length)}s</span></span>
      <Segmented size="s" label="Speed" value={rate} onChange={(r) => transport.setRate(r)} options={[{ value: 1, label: '1×' }, { value: 0.5, label: '½×' }, { value: 0.25, label: '¼×' }]} />
      <span className="grow" />
      <span className={ratio < SOFT_BELOW ? 'readout soft' : 'readout'} title="Whether the take has enough pixels for this lean. Past its limit, the lean enlarges the take and text blurs.">
        {ratio < SOFT_BELOW ? `Soft here: ${Math.round((1 / ratio - 1) * 100)}% past the take's pixels` : 'Sharp here'}
      </span>
    </div>
  );
}
