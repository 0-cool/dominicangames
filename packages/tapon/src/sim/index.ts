/** DOM-free simulation entry point (used by the server to verify runs). */
export { World, sprites, makeRng } from './world.ts';
export { KINDS, OBSTACLES } from './kinds.ts';
export { SIM_STEP, SIM_VERSION, InputRecorder, decodeInputs, encodeInputs, replayRun, sameResult, type ReplayResult } from './replay.ts';
export { AVENUES, STAGE_M, stageName } from '../config.ts';
