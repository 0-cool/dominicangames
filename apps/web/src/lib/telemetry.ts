import { api } from './api.ts';

let sent = 0;

/** Report a client error to the server (rate-limited there; capped here at 5 per page load). */
export function reportError(err: unknown, context?: string) {
  if (sent >= 5) return;
  sent++;
  const e = err instanceof Error ? err : new Error(String(err));
  void api('/api/telemetry/client-error', {
    method: 'POST',
    body: { message: e.message.slice(0, 1000), stack: e.stack?.slice(0, 8000), url: location.pathname.slice(0, 500), context: context?.slice(0, 200) },
  }).catch(() => undefined);
}

export function installErrorReporting() {
  window.addEventListener('error', (ev) => {
    if (ev.error) reportError(ev.error, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason as { name?: string } | undefined;
    if (r?.name === 'AbortError') return;
    reportError(ev.reason, 'unhandledrejection');
  });
}
