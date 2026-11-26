import type { FastifyInstance } from 'fastify';
import { desc } from 'drizzle-orm';
import { clientErrorSchema, supportTicketSchema } from '@sd/shared';
import type { Ctx } from '../app.ts';
import { limit } from '../lib/limits.ts';
import { devEmails, supportTickets } from '../db/schema.ts';
import { badRequest } from '../lib/errors.ts';
import { audit, logError } from '../services/audit.ts';

export function miscRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg } = ctx;

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  app.post('/api/support/tickets', { config: limit(ctx.cfg, 5, '1 hour') }, async (req) => {
    const t = supportTicketSchema.parse(req.body);
    const email = req.user?.email ?? t.email;
    if (!email) throw badRequest('email_required', 'Indica un correo para responderte.');
    const [row] = await db.insert(supportTickets).values({ userId: req.user?.id ?? null, email, category: t.category, subject: t.subject, message: t.message }).returning({ id: supportTickets.id });
    await audit(db, { actorUserId: req.user?.id, action: 'support.ticket_created', targetType: 'ticket', targetId: row.id, ip: req.ip });
    return { ok: true, id: row.id };
  });

  app.post('/api/telemetry/client-error', { config: limit(ctx.cfg, 30, '1 minute') }, async (req) => {
    const e = clientErrorSchema.parse(req.body);
    await logError(db, { source: 'client', message: e.message, stack: e.stack, context: { url: e.url, context: e.context, ua: req.headers['user-agent']?.slice(0, 200) }, userId: req.user?.id });
    return { ok: true };
  });

  // Development-only mailbox (used by local QA and end-to-end tests to read verification links).
  if (cfg.DEV_MAILBOX && !cfg.isProd) {
    app.get('/api/dev/mailbox', async () => ({ emails: await db.select().from(devEmails).orderBy(desc(devEmails.createdAt)).limit(50) }));
  }
}
