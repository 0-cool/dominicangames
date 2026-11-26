import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { checkoutSchema, formatDop } from '@sd/shared';
import type { Ctx } from '../app.ts';
import { limit } from '../lib/limits.ts';
import { payments } from '../db/schema.ts';
import { hmacSha256, safeEqual } from '../lib/crypto.ts';
import { HttpError, badRequest, notFound } from '../lib/errors.ts';
import { requireUser, requireVerified } from '../plugins/security.ts';
import { logError } from '../services/audit.ts';
import { WebhookVerificationError } from '../services/payments/provider.ts';
import { SandboxProvider } from '../services/payments/sandbox.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * DG Monetization — payment endpoints. DominicanGames is free: with MONETIZATION_ENABLED=false (default) no
 * checkout can be created. Status, webhooks, provider returns and refunds stay available so that payments made
 * before the platform became free keep resolving correctly.
 */
export function paymentRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg, payments: svc, monetization } = ctx;

  app.get('/api/payments/config', async () => monetization.status());

  app.post('/api/payments/checkout', { config: limit(ctx.cfg, 10, '1 hour') }, async (req) => {
    if (!monetization.enabled) throw new HttpError(410, 'monetization_disabled', 'DominicanGames es gratis: no hay nada que pagar para jugar.');
    const u = requireVerified(req);
    const { idempotencyKey, productCode } = checkoutSchema.parse(req.body);
    const product = monetization.product(productCode);
    if (!product) throw notFound('Ese producto no está disponible.');
    return svc.createCheckout(u, product, idempotencyKey, req.ip);
  });

  app.get<{ Params: { id: string } }>('/api/payments/:id', async (req) => {
    const u = requireUser(req);
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw notFound();
    const [p] = await db
      .select({ id: payments.id, status: payments.status, amount: payments.amount, currency: payments.currency, createdAt: payments.createdAt, paidAt: payments.paidAt, failureReason: payments.failureReason, provider: payments.provider })
      .from(payments)
      .where(and(eq(payments.id, req.params.id), eq(payments.userId, u.id)));
    if (!p) throw notFound('Pago no encontrado.');
    return { payment: p };
  });

  // Provider → server webhooks. Raw body is needed for signature verification.
  app.post<{ Params: { provider: string } }>('/api/payments/webhook/:provider', { config: limit(ctx.cfg, 120, '1 minute') }, async (req, reply) => {
    if (req.params.provider !== svc.provider.name) throw notFound();
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
    try {
      const event = await svc.provider.verifyWebhook(raw, req.headers);
      const result = await svc.processEvent(event);
      req.log.info({ eventId: event.eventId, type: event.type, result }, 'payment webhook processed');
      return { received: true, result };
    } catch (e) {
      if (e instanceof WebhookVerificationError) {
        req.log.warn({ reason: e.message }, 'payment webhook rejected');
        await logError(db, { source: 'server', message: `webhook rejected: ${e.message}`, context: { provider: req.params.provider, ip: req.ip } });
        reply.code(400);
        return { received: false };
      }
      throw e;
    }
  });

  // Redirect-based providers (AZUL): verify server-to-server before showing a result.
  app.get<{ Params: { provider: string }; Querystring: Record<string, string> }>('/api/payments/return/:provider', async (req, reply) => {
    if (req.params.provider !== svc.provider.name || !svc.provider.verifyReturn) throw notFound();
    const ev = await svc.provider.verifyReturn(req.query);
    if (ev) await svc.processEvent(ev);
    const [p] = ev ? await db.select({ id: payments.id }).from(payments).where(eq(payments.providerReference, ev.providerReference)) : [];
    return reply.redirect(`${cfg.APP_ORIGIN}/pago/resultado${p ? `?id=${p.id}` : ''}`);
  });

  // ───────────── Sandbox hosted payment page (never available in production) ─────────────
  if (svc.provider instanceof SandboxProvider) {
    const sandbox = svc.provider;
    const formToken = (ref: string) => hmacSha256(cfg.CSRF_SECRET, `sandbox:${ref}`);
    app.get<{ Params: { ref: string } }>('/sandbox-pay/:ref', async (req, reply) => {
      const ref = req.params.ref;
      if (!/^sbx_[a-f0-9]{24}$/.test(ref)) throw notFound();
      const [p] = await db.select().from(payments).where(eq(payments.providerReference, ref));
      if (!p) throw notFound();
      const done = p.status !== 'pending' && p.status !== 'created';
      reply.type('text/html; charset=utf-8');
      return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pasarela de pruebas</title>
<style>body{margin:0;font-family:system-ui,Arial;background:#f3f4f6;color:#111}.w{max-width:440px;margin:40px auto;background:#fff;border-radius:14px;box-shadow:0 10px 40px #0002;overflow:hidden}
.b{background:#b91c1c;color:#fff;padding:10px 16px;font-weight:700;font-size:13px;letter-spacing:.04em}.c{padding:24px}h1{font-size:20px;margin:0 0 4px}.amt{font-size:34px;font-weight:800;margin:16px 0}
button{width:100%;padding:14px;border:0;border-radius:10px;font-size:15px;font-weight:700;margin-top:10px;cursor:pointer}.ok{background:#16a34a;color:#fff}.no{background:#e5e7eb}.cx{background:transparent;color:#555}
.n{font-size:12px;color:#666;margin-top:16px;line-height:1.5}</style></head><body><div class="w"><div class="b">ENTORNO DE PRUEBAS — NO SE PROCESARÁ NINGÚN PAGO REAL</div><div class="c">
<h1>Pasarela simulada (sandbox)</h1><div>${esc(typeof p.metadata?.productCode === 'string' ? `Producto ${p.metadata.productCode}` : 'Acceso original — Santo Domingo Open World')} · DominicanGames</div><div class="amt">${esc(formatDop(p.amount))}</div>
<div>Referencia: <code>${esc(ref)}</code></div>
${done ? `<p><b>Este pago ya fue procesado (${esc(p.status)}).</b></p><a href="${esc(cfg.APP_ORIGIN)}/pago/resultado?id=${p.id}">Volver</a>` : `
<form method="post" action="/sandbox-pay/${esc(ref)}/complete"><input type="hidden" name="t" value="${formToken(ref)}">
<button class="ok" name="outcome" value="approve" data-testid="sandbox-approve">Aprobar pago (simulado)</button>
<button class="no" name="outcome" value="decline" data-testid="sandbox-decline">Rechazar pago (simulado)</button>
<button class="cx" name="outcome" value="cancel">Cancelar</button></form>`}
<p class="n">Esta página imita una pasarela hospedada. No ingreses datos de tarjeta: el entorno de pruebas no los solicita. El resultado se comunica al servidor mediante un webhook firmado (HMAC-SHA256).</p>
</div></div></body></html>`;
    });

    app.post<{ Params: { ref: string }; Body: { outcome?: string; t?: string } }>('/sandbox-pay/:ref/complete', async (req, reply) => {
      const ref = req.params.ref;
      if (!/^sbx_[a-f0-9]{24}$/.test(ref)) throw notFound();
      const body = req.body ?? {};
      if (!body.t || !safeEqual(body.t, formToken(ref))) throw badRequest('bad_form', 'Formulario inválido.');
      const [p] = await db.select().from(payments).where(eq(payments.providerReference, ref));
      if (!p) throw notFound();
      const type = body.outcome === 'approve' ? 'payment.succeeded' : body.outcome === 'decline' ? 'payment.failed' : 'payment.canceled';
      const event = sandbox.buildEvent(type, ref, p.amount, p.currency, type === 'payment.failed' ? 'Tarjeta rechazada (simulado)' : undefined);
      const raw = JSON.stringify(event);
      // deliver through the real webhook endpoint so signature verification is exercised end-to-end
      const res = await app.inject({ method: 'POST', url: `/api/payments/webhook/sandbox`, payload: raw, headers: { 'content-type': 'application/json', 'x-sd-signature': sandbox.sign(raw) } });
      if (res.statusCode !== 200) req.log.error({ status: res.statusCode, body: res.body }, 'sandbox webhook delivery failed');
      return reply.redirect(`${cfg.APP_ORIGIN}/pago/resultado?id=${p.id}`, 303);
    });
  }
}
