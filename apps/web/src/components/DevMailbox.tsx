import { useCallback, useEffect, useState } from 'react';
import { Api } from '../lib/api.ts';
import { fmtDateTime } from '../lib/format.ts';

interface Mail {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

/**
 * Development-only inbox. The endpoint exists only when the server runs with
 * DEV_MAILBOX=true outside production, so this renders nothing in production.
 */
export function DevMailbox({ email }: { email?: string }) {
  const [mails, setMails] = useState<Mail[] | null>(null);
  const load = useCallback(() => {
    Api.devMailbox()
      .then((r) => setMails(r.emails.filter((m) => !email || m.to.toLowerCase() === email.toLowerCase()).slice(0, 5)))
      .catch(() => setMails(null));
  }, [email]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  if (!mails) return null;
  return (
    <div className="mt-8 rounded-xl border border-dashed border-gold-400/40 bg-gold-400/[0.04] p-4 text-left" data-testid="dev-mailbox">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-300">Bandeja de desarrollo</p>
      <p className="mt-1 text-xs text-ink-400">Solo visible en entorno local (DEV_MAILBOX=true). En producción los correos se envían por SMTP.</p>
      {mails.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">Sin correos todavía.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {mails.map((m) => {
            const links = m.text.match(/https?:\/\/[^\s]+/g) ?? [];
            return (
              <li key={m.id} className="rounded-lg bg-black/30 p-3 text-sm">
                <p className="font-medium text-ink-100">{m.subject}</p>
                <p className="text-xs text-ink-400">
                  Para {m.to} · {fmtDateTime(m.createdAt)}
                </p>
                {links.map((l) => (
                  <a key={l} href={l.replace(/^https?:\/\/[^/]+/, '')} className="mt-1 block truncate text-sun-400 underline" data-testid="dev-mail-link">
                    {l}
                  </a>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
