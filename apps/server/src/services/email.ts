import nodemailer, { type Transporter } from 'nodemailer';
import type { DB } from '../db/index.ts';
import { devEmails } from '../db/schema.ts';
import type { Config } from '../config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends transactional email over SMTP; in development it can store mail in a dev mailbox table. */
export class Mailer {
  private transport: Transporter | null = null;
  constructor(private readonly cfg: Config, private readonly db: DB, private readonly log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }) {
    if (cfg.SMTP_URL) this.transport = nodemailer.createTransport(cfg.SMTP_URL);
  }

  async send(m: Mail) {
    if (this.cfg.DEV_MAILBOX && !this.cfg.isProd) {
      await this.db.insert(devEmails).values({ to: m.to, subject: m.subject, text: m.text, html: m.html });
      this.log.info({ to: m.to, subject: m.subject }, 'dev mailbox: email stored');
    }
    if (this.transport) {
      try {
        await this.transport.sendMail({ from: this.cfg.MAIL_FROM, ...m });
      } catch (e) {
        this.log.error({ err: (e as Error).message }, 'smtp send failed');
        if (this.cfg.isProd) throw e;
      }
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** DominicanGames e-mail layout (inline styles only — e-mail clients ignore stylesheets). */
const shell = (title: string, body: string) => `<!doctype html><html lang="es"><body style="margin:0;background:#060812;font-family:Arial,Helvetica,sans-serif;color:#e6e9f2">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px"><tr>
<td style="width:12px;height:12px;background:#2f5bff;border-radius:3px"></td><td style="width:3px"></td><td style="width:12px;height:12px;background:#ff2e4d;border-radius:3px"></td>
<td style="width:10px"></td><td style="font-weight:900;letter-spacing:.06em;color:#ffffff;font-size:14px">DOMINICAN<span style="color:#ff2e4d">GAMES</span></td></tr></table>
<h1 style="font-size:22px;color:#fff;margin:0 0 12px">${title}</h1>${body}
<p style="font-size:12px;color:#8a90a6;margin-top:32px">Si no solicitaste este correo, puedes ignorarlo.<br>DominicanGames · One platform. Multiple worlds. · Hecho en República Dominicana</p></div></body></html>`;

const btn = (href: string, label: string) => `<p><a href="${href}" style="display:inline-block;background:#ff2e4d;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">${label}</a></p><p style="font-size:12px;color:#8a90a6;word-break:break-all">${href}</p>`;

export const templates = {
  verify: (link: string, username: string): Omit<Mail, 'to'> => ({
    subject: 'Confirma tu correo — DominicanGames',
    text: `¡Hola, ${username}! Bienvenido a DominicanGames. Confirma tu correo abriendo este enlace (vence en 24 horas): ${link}`,
    html: shell(`¡Hola, ${esc(username)}!`, `<p>Bienvenido a DominicanGames. Tu cuenta ya está lista y puedes jugar gratis; confirma tu correo para proteger tu cuenta y poder recuperarla. El enlace vence en 24 horas.</p>${btn(link, 'Confirmar correo')}`),
  }),
  reset: (link: string): Omit<Mail, 'to'> => ({
    subject: 'Restablece tu contraseña — DominicanGames',
    text: `Restablece la contraseña de tu cuenta DominicanGames con este enlace (vence en 1 hora): ${link}`,
    html: shell('Restablecer contraseña', `<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta DominicanGames. El enlace vence en 1 hora.</p>${btn(link, 'Crear nueva contraseña')}`),
  }),
  /** Receipt for an optional DG Monetization purchase (none is active; also used by legacy late confirmations). */
  receipt: (amount: string, ref: string): Omit<Mail, 'to'> => ({
    subject: 'Pago confirmado — DominicanGames',
    text: `Recibimos tu pago de ${amount}. Referencia: ${ref}.`,
    html: shell('Pago confirmado', `<p>Recibimos tu pago de <b>${esc(amount)}</b>.</p><p>Referencia: <code>${esc(ref)}</code></p><p style="font-size:12px;color:#8a90a6">Este correo es un comprobante de pago, no una factura con NCF.</p>`),
  }),
};
