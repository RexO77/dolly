/**
 * The helpers a scenario's own modules may share. Scenarios need none of
 * these: everything arrives on `h`. They are here for code that runs
 * beside Dolly, such as a project's shared scenario helpers.
 */
export { ease, seeded, sleep } from './motion.mjs';
export { fraction, evaluate } from './input.mjs';
export * as grammar from './camera/grammar.mjs';
