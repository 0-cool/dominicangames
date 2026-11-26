import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = {
  DATABASE_URL: 'postgres://x/y',
  CSRF_SECRET: 'a'.repeat(40),
  SANDBOX_WEBHOOK_SECRET: 'b'.repeat(40),
} as NodeJS.ProcessEnv;

describe('configuration safety', () => {
  it('accepts a development configuration', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development', DEV_MAILBOX: 'true' }).isProd).toBe(false);
  });
  it('runs in production with DG Monetization off (default) and no payment provider', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtp://x', SANDBOX_WEBHOOK_SECRET: undefined });
    expect(c.MONETIZATION_ENABLED).toBe(false);
  });
  it('refuses the sandbox provider in production when monetization is enabled', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtp://x', MONETIZATION_ENABLED: 'true' })).toThrow(/sandbox/);
  });
  it('refuses the development mailbox in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtp://x', ALLOW_SANDBOX_IN_PRODUCTION: 'true', DEV_MAILBOX: 'true' })).toThrow(/DEV_MAILBOX/);
  });
  it('requires SMTP in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', ALLOW_SANDBOX_IN_PRODUCTION: 'true' })).toThrow(/SMTP_URL/);
  });
  it('refuses placeholder secrets in production', () => {
    expect(() => loadConfig({ ...base, CSRF_SECRET: 'change-me-change-me-change-me-change-me-0001', NODE_ENV: 'production', SMTP_URL: 'smtp://x', ALLOW_SANDBOX_IN_PRODUCTION: 'true' })).toThrow(/placeholder/);
  });
  it('rejects short secrets', () => {
    expect(() => loadConfig({ ...base, CSRF_SECRET: 'short' })).toThrow(/CSRF_SECRET/);
  });
  it('ignores the removed RD$100 pricing variables if an old .env still has them', () => {
    const c = loadConfig({ ...base, ACCESS_PRICE_MINOR: '10000', ACCESS_ITBIS_MINOR: '1525' } as NodeJS.ProcessEnv);
    expect((c as Record<string, unknown>).ACCESS_PRICE_MINOR).toBeUndefined();
  });
  it('uses secure cookies in production by default', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtp://x', ALLOW_SANDBOX_IN_PRODUCTION: 'true' });
    expect(c.cookieSecure).toBe(true);
  });
});
