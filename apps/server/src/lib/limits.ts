import type { Config } from '../config.ts';

/**
 * Per-route rate-limit config. Every limit is keyed by client IP and multiplied by
 * RATE_LIMIT_SCALE (default 1). Raise the scale only for automated test runs or
 * environments where many legitimate users share one IP (carrier-grade NAT).
 */
export function limit(cfg: Pick<Config, 'RATE_LIMIT_SCALE'>, max: number, timeWindow: string) {
  return { rateLimit: { max: Math.max(1, Math.ceil(max * cfg.RATE_LIMIT_SCALE)), timeWindow } };
}
