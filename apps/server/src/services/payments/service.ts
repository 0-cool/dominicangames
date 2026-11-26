import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { formatDop } from '@sd/shared';
import type { Config } from '../../config.ts';
import type { DB } from '../../db/index.ts';
import { gameAccess, payments, users, webhookEvents } from '../../db/schema.ts';
import { conflict, forbidden, notFound } from '../../lib/errors.ts';
import { audit } from '../audit.ts';
import { type Mailer, templates } from '../email.ts';
import type { PaymentProvider, ProviderEvent } from './provider.ts';

type Status = (typeof payments.$inferSelect)['status'];

const ALLOWED: Record<ProviderEvent['type'], Status[]> = {
  'payment.succeeded': ['created', 'pending', 'failed', 'canceled'],
  'payment.failed': ['created', 'pending'],
  'payment.canceled': ['created', 'pending'],
  'payment.refunded': ['succeeded'],
};
const TARGET: Record<ProviderEvent['type'], Status> = {
  'payment.succeeded': 'succeeded',
  'payment.failed': 'failed',
  'payment.canceled': 'canceled',
  'payment.refunded': 'refunded',
};

export type ProcessResult = 'processed' | 'duplicate' | 'unknown_payment' | 'amount_mismatch' | 'ignored_transition';

/**
 * An optional product sold through DG Monetization (premium membership, virtual currency, cosmetics…).
 * None is configured: DominicanGames is free and nothing is required to play.
 */
export interface Product {
  code: string;
  title: string;
  description: string;
  /** Total in centavos, ITBIS included. */
  amountMinor: number;
  itbisMinor: number;
  currency: 'DOP';
  kind: 'one_time' | 'membership' | 'virtual_currency' | 'cosmetic';
}

/**
 * Payment engine (provider-agnostic): checkout creation, verified webhook processing (idempotent state machine),
 * refunds. Originally built for the RD$100 access purchase, which no longer exists; payments made before the
 * platform became free still resolve here (they grant the cosmetic Fundador entitlement).
 */
export class PaymentService {
  constructor(
    private readonly db: DB,
    private readonly cfg: Config,
    readonly provider: PaymentProvider,
    private readonly mailer: Mailer,
  ) {}

  /** Legacy RD$100 lifetime access (pre-DominicanGames). Never used to gate gameplay. */
  async hasLegacyAccess(userId: string): Promise<boolean> {
    const [a] = await this.db.select({ s: gameAccess.accessStatus }).from(gameAccess).where(eq(gameAccess.userId, userId));
    return a?.s === 'active';
  }

  async createCheckout(user: { id: string; email: string }, product: Product, idempotencyKey: string, ip?: string): Promise<{ paymentId: string; redirectUrl: string; reused: boolean }> {
    if (product.kind === 'one_time') {
      const [owned] = await this.db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.userId, user.id), eq(payments.status, 'succeeded'), sql`${payments.metadata}->>'productCode' = ${product.code}`))
        .limit(1);
      if (owned) throw conflict('already_purchased', 'Ya tienes este producto.');
    }
    // reuse a recent open checkout for the same product instead of creating duplicates
    const recent = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, user.id), inArray(payments.status, ['created', 'pending']), gt(payments.createdAt, new Date(Date.now() - 30 * 60_000)), eq(payments.provider, this.provider.name), sql`${payments.metadata}->>'productCode' = ${product.code}`))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (recent[0]?.metadata?.redirectUrl) return { paymentId: recent[0].id, redirectUrl: String(recent[0].metadata.redirectUrl), reused: true };
    const { amountMinor, itbisMinor, currency } = product;
    let row = (
      await this.db
        .insert(payments)
        .values({ userId: user.id, provider: this.provider.name, idempotencyKey, amount: amountMinor, itbis: itbisMinor, currency, status: 'created', metadata: { productCode: product.code } })
        .onConflictDoNothing({ target: payments.idempotencyKey })
        .returning()
    )[0];
    if (!row) {
      const [existing] = await this.db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey));
      if (!existing || existing.userId !== user.id) throw conflict('idempotency_conflict', 'Clave de idempotencia en uso.');
      if (existing.metadata?.redirectUrl) return { paymentId: existing.id, redirectUrl: String(existing.metadata.redirectUrl), reused: true };
      row = existing;
    }
    const session = await this.provider.createCheckout({
      paymentId: row.id,
      orderNumber: row.id.replace(/-/g, '').slice(0, 24),
      amountMinor,
      itbisMinor,
      currency,
      description: `${product.title} — DominicanGames`,
      customerEmail: user.email,
      returnUrl: `${this.cfg.APP_ORIGIN}/pago/resultado?id=${row.id}`,
    });
    await this.db
      .update(payments)
      .set({ providerReference: session.providerReference, status: 'pending', metadata: { productCode: product.code, redirectUrl: session.redirectUrl }, updatedAt: new Date() })
      .where(eq(payments.id, row.id));
    await audit(this.db, { actorUserId: user.id, action: 'payment.checkout_created', targetType: 'payment', targetId: row.id, ip, details: { provider: this.provider.name, amount: amountMinor, productCode: product.code } });
    return { paymentId: row.id, redirectUrl: session.redirectUrl, reused: false };
  }

  /** Idempotent, transactional state machine driven only by verified provider events. */
  async processEvent(e: ProviderEvent): Promise<ProcessResult> {
    const provider = this.provider.name;
    let granted: { email: string; ref: string; amount: number } | null = null;
    const result = await this.db.transaction(async (tx) => {
      const ins = await tx
        .insert(webhookEvents)
        .values({ provider, eventId: e.eventId, type: e.type, payload: e.raw as object })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (!ins.length) return 'duplicate' as const;
      const [p] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.provider, provider), eq(payments.providerReference, e.providerReference)))
        .for('update');
      const markProcessed = (paymentId?: string) => tx.update(webhookEvents).set({ processedAt: new Date(), paymentId }).where(eq(webhookEvents.id, ins[0].id));
      if (!p) {
        await markProcessed();
        await audit(tx as unknown as DB, { action: 'payment.webhook_unknown_reference', targetType: 'payment', details: { provider, reference: e.providerReference } });
        return 'unknown_payment' as const;
      }
      if (e.type !== 'payment.refunded' && (e.amountMinor !== p.amount || e.currency !== p.currency)) {
        await markProcessed(p.id);
        await audit(tx as unknown as DB, { action: 'payment.amount_mismatch', targetType: 'payment', targetId: p.id, details: { expected: p.amount, got: e.amountMinor, currency: e.currency } });
        return 'amount_mismatch' as const;
      }
      if (!ALLOWED[e.type].includes(p.status)) {
        await markProcessed(p.id);
        return 'ignored_transition' as const;
      }
      const now = new Date();
      const target = TARGET[e.type];
      await tx
        .update(payments)
        .set({ status: target, updatedAt: now, ...(target === 'succeeded' ? { paidAt: now, failureReason: null } : {}), ...(target === 'failed' || target === 'canceled' ? { failureReason: e.failureReason ?? target } : {}), ...(target === 'refunded' ? { refundedAt: now } : {}) })
        .where(eq(payments.id, p.id));
      const productCode = typeof p.metadata?.productCode === 'string' ? p.metadata.productCode : null;
      if (target === 'succeeded') {
        if (!productCode) {
          // Legacy RD$100 access bought before DominicanGames became free → cosmetic Fundador entitlement.
          await tx
            .insert(gameAccess)
            .values({ userId: p.userId, accessStatus: 'active', accessType: 'LIFETIME', paymentId: p.id, activatedAt: now })
            .onConflictDoUpdate({ target: gameAccess.userId, set: { accessStatus: 'active', revokedAt: null, paymentId: p.id, activatedAt: now } });
          await audit(tx as unknown as DB, { actorUserId: p.userId, action: 'access.granted', targetType: 'user', targetId: p.userId, details: { paymentId: p.id, legacy: true } });
        } else {
          await audit(tx as unknown as DB, { actorUserId: p.userId, action: 'entitlement.granted', targetType: 'user', targetId: p.userId, details: { paymentId: p.id, productCode } });
        }
        const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, p.userId));
        if (u) granted = { email: u.email, ref: p.id, amount: p.amount };
      }
      if (target === 'refunded' && !productCode && this.cfg.REVOKE_ACCESS_ON_REFUND) {
        await tx.update(gameAccess).set({ accessStatus: 'revoked', revokedAt: now }).where(and(eq(gameAccess.userId, p.userId), eq(gameAccess.paymentId, p.id)));
        await audit(tx as unknown as DB, { action: 'access.revoked', targetType: 'user', targetId: p.userId, details: { paymentId: p.id, reason: 'refund' } });
      }
      await audit(tx as unknown as DB, { actorUserId: p.userId, action: `payment.${target}`, targetType: 'payment', targetId: p.id, details: { eventId: e.eventId } });
      await markProcessed(p.id);
      return 'processed' as const;
    });
    if (granted) {
      const g = granted as { email: string; ref: string; amount: number };
      await this.mailer.send({ to: g.email, ...templates.receipt(formatDop(g.amount), g.ref) }).catch(() => undefined);
    }
    return result;
  }

  async refund(paymentId: string, adminId: string, ip?: string): Promise<{ ok: boolean; message?: string }> {
    const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    if (!p) throw notFound('Pago no encontrado.');
    if (p.status !== 'succeeded') throw forbidden('not_refundable', 'Solo se pueden reembolsar pagos completados.');
    const r = await this.provider.refund({ providerReference: p.providerReference!, amountMinor: p.amount, itbisMinor: p.itbis, paidAt: p.paidAt, metadata: p.metadata ?? {} });
    await audit(this.db, { actorUserId: adminId, action: r.ok ? 'payment.refund_requested' : 'payment.refund_failed', targetType: 'payment', targetId: p.id, ip, details: { message: r.message, reference: r.reference } });
    if (!r.ok) return { ok: false, message: r.message };
    await this.processEvent({ eventId: `refund_${p.id}`, type: 'payment.refunded', providerReference: p.providerReference!, amountMinor: p.amount, currency: p.currency, raw: { refundReference: r.reference, by: adminId } });
    return { ok: true };
  }
}
