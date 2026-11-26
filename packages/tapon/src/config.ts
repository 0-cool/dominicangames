/** El Tapón constants (reference resolution 1920×1080, 75 px = 1 m). */
export const VIEW_W = 1920;
export const VIEW_H = 1080;
export const PX = 75;

/** Three road lanes, far (0) to near (2): ground line on screen and sprite scale (depth). */
export const LANES = [
  { y: 716, s: 0.84 },
  { y: 838, s: 0.92 },
  { y: 966, s: 1.0 },
] as const;

/** Left edge of the motoconcho sprite on screen. */
export const PLAYER_X = 300;
export const VIEW_AHEAD_M = (VIEW_W - PLAYER_X) / PX;
export const VIEW_BEHIND_M = PLAYER_X / PX;

export const LANE_CHANGE_S = 0.16;
/** Ground speed of the moto: from START to MAX as the run goes on (m/s). */
export const SPEED_START = 9;
export const SPEED_MAX = 21;
export const SPEED_RAMP_M = 2600;
export const baseSpeed = (distM: number) => SPEED_START + (SPEED_MAX - SPEED_START) * (1 - expNeg(distM / SPEED_RAMP_M));

/**
 * e^(−x) for x ≥ 0 using only + − × ÷, which JavaScript specifies exactly (Math.exp may differ in the last bit
 * between browsers). This keeps the simulation bit-for-bit reproducible, so the server can replay a run.
 */
export function expNeg(x: number): number {
  if (!(x > 0)) return 1;
  if (x > 700) return 0;
  // e^(−x) = (e^(−y))^(2^k) with y = x / 2^k ≤ 1/16: 10 Taylor terms are below double precision there
  let k = 0;
  let y = x;
  while (y > 0.0625) {
    y *= 0.5;
    k++;
  }
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 10; i++) {
    term = (term * -y) / i;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= sum;
  return sum;
}

export const LIVES = 3;
export const INVULN_S = 1.6;
export const COMBO_WINDOW_S = 4;
export const STAGE_M = 600;
export const AVENUES = ['Av. Abraham Lincoln', 'Av. 27 de Febrero', 'Av. John F. Kennedy', 'Av. Duarte', 'Av. Máximo Gómez', 'Av. Winston Churchill'] as const;
export const stageName = (stage: number) => `${AVENUES[stage % AVENUES.length]}${stage >= AVENUES.length ? ` · Hora pico +${Math.floor(stage / AVENUES.length)}` : ''}`;

/** Fairness model (see sim/fairness.ts). */
export const FAIR = {
  horizonS: 8,
  stepS: 0.05,
  /** Players need time to notice something new before they can react. */
  reactS: 0.45,
  /** Extra clearance around every hitbox in the model (m): what a player needs. */
  margin: 0.25,
  /** The game itself is stricter when it changes the road, so small timing differences never close the way out. */
  worldMargin: 0.5,
} as const;
