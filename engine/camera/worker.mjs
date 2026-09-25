/* A render worker: turns master frames into delivered frames, one message at a time. */
import { parentPort } from 'node:worker_threads';
import { renderFrame } from './frame.mjs';

parentPort.on('message', ({ id, src, W, H, OW, OH, view, spots, css }) => {
  const out = renderFrame(new Uint8Array(src), W, H, OW, OH, view, spots, css);
  parentPort.postMessage({ id, out: out.buffer }, [out.buffer]);
});
