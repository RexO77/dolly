/* A film render worker: one film frame per message, from a crop of a master frame, with its motion blur. */
import { parentPort } from 'node:worker_threads';
import { pyramid, renderFilmFrame } from './frame.mjs';

parentPort.on('message', ({ id, src, cw, ch, plane, subframes, OW, OH }) => {
  const levels = pyramid(new Uint8Array(src), cw, ch);
  /* The shutter: the camera's positions across it, averaged. */
  const sum = new Float32Array(OW * OH * 3);
  for (const { cam, look } of subframes) {
    const img = renderFilmFrame(levels, plane, cam, look, OW, OH);
    for (let i = 0; i < sum.length; i += 1) sum[i] += img[i];
  }
  const out = new Uint8Array(OW * OH * 3);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(0, Math.min(255, Math.round(sum[i] / subframes.length)));
  parentPort.postMessage({ id, out: out.buffer }, [out.buffer]);
});
