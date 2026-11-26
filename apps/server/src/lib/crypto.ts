import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('hex');
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const hmacSha256 = (key: string, v: string) => createHmac('sha256', key).update(v).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
