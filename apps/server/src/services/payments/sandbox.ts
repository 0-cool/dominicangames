import { z } from 'zod';
import { hmacSha256, randomToken, safeEqual } from '../../lib/crypto.ts';
import { type CheckoutInput, type CheckoutSession, type PaymentProvider, type ProviderEvent, WebhookVerificationError } from './provider.ts';

const eventSchema = z.object({
  id: z.string().min(8).max(128),
  type: z.enum(['payment.succeeded', 'payment.failed', 'payment.canceled', 'payment.refunded']),
  created: z.number().int(),
  data: z.object({ reference: z.string().min(8).max(128), amount: z.number().int().nonnegative(), currency: z.string().length(3), reason: z.string().max(200).optional() }),
});

/**
 * Sandbox provider: a simulated hosted payment page served by this backend at
 * /sandbox-pay/:ref plus HMAC-SHA256-signed webhooks (header
 * `X-SD-Signature: t=<unix>,v1=<hex>` over `${t}.${rawBody}`). It mimics the
 * shape of real provider integrations so the full flow can be tested without
 * moving money. It can never be enabled in production (see config.ts).
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';
  readonly hostedPageOrigin = null;
  constructor(private readonly secret: string, private readonly publicBase: string) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const ref = `sbx_${randomToken(12)}`;
    void input;
    return { providerReference: ref, redirectUrl: `${this.publicBase}/sandbox-pay/${ref}` };
  }

  sign(rawBody: string, t = Math.floor(Date.now() / 1000)): string {
    return `t=${t},v1=${hmacSha256(this.secret, `${t}.${rawBody}`)}`;
  }

  buildEvent(type: ProviderEvent['type'], reference: string, amount: number, currency: string, reason?: string) {
    return { id: `evt_${randomToken(12)}`, type, created: Math.floor(Date.now() / 1000), data: { reference, amount, currency, reason } };
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<ProviderEvent> {
    const header = headers['x-sd-signature'];
    const sig = Array.isArray(header) ? header[0] : header;
    if (!sig) throw new WebhookVerificationError('missing signature');
    const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.v1) throw new WebhookVerificationError('malformed signature');
    if (Math.abs(Date.now() / 1000 - t) > 300) throw new WebhookVerificationError('stale signature');
    const expected = hmacSha256(this.secret, `${t}.${rawBody}`);
    if (!safeEqual(expected, parts.v1)) throw new WebhookVerificationError('bad signature');
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError('invalid json');
    }
    const ev = eventSchema.safeParse(json);
    if (!ev.success) throw new WebhookVerificationError('invalid event');
    const e = ev.data;
    return { eventId: e.id, type: e.type, providerReference: e.data.reference, amountMinor: e.data.amount, currency: e.data.currency, raw: e, failureReason: e.data.reason };
  }

  async refund(): Promise<{ ok: boolean; reference?: string }> {
    return { ok: true, reference: `rf_${randomToken(8)}` };
  }
}
