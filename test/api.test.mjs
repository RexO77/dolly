import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as dolly from '../engine/index.mjs';

test('the package exports the pipeline and the scenario helpers', () => {
  for (const name of ['loadWorkspace', 'loadProject', 'loadClip', 'matchClips', 'ensureServer', 'record', 'direct', 'render', 'poster', 'deliver', 'status', 'shootStills', 'deliverStills', 'ease', 'seeded', 'sleep', 'fraction', 'evaluate']) {
    assert.equal(typeof dolly[name], name === 'ease' ? 'object' : 'function', name);
  }
  assert.equal(dolly.grammar.LEAN_Z, 1.35);
});
