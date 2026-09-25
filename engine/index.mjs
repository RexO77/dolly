/**
 * Dolly from Node: the same pipeline the `dolly` command runs, for scripts
 * and CI. Scenarios need none of this; everything they use arrives on `h`.
 *
 *   import { loadWorkspace, loadProject, loadClip, record, direct, render } from '@nischalskanda/dolly';
 *
 *   const project = await loadProject(loadWorkspace(), 'shop');
 *   const clip = await loadClip(project, 'shop-first');
 *   await record(project, clip);
 *   await direct(project, clip);
 *   await render(project, clip);
 *
 * `record` needs the product running (see `ensureServer`) and a display for
 * Chrome's window; the other stages work from what the last one wrote.
 */

/* Where clips live, and what they are. */
export { loadWorkspace, findRoot } from './workspace.mjs';
export { listProjects, loadProject, listClips, matchClips, loadClip, clipUrl } from './config.mjs';

/* The stages. */
export { ensureServer } from './server.mjs';
export { record } from './record.mjs';
export { direct, render, poster, deliver, status, specFor } from './stages.mjs';
export { shootStills, deliverStills } from './stills.mjs';
export { storyboard, formatStoryboard } from './storyboard.mjs';

/* The helpers a project's shared scenario code may want, and the grammar's numbers. */
export { ease, seeded, sleep } from './motion.mjs';
export { fraction, evaluate } from './input.mjs';
export * as grammar from './camera/grammar.mjs';
