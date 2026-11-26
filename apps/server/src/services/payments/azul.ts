import { readFileSync } from 'node:fs';
import { Agent, request } from 'node:https';
import type { Config } from '../../config.ts';
import { type CheckoutInput, type CheckoutSession, type PaymentProvider, type ProviderEvent, ProviderNotReadyError, WebhookVerificationError } from './provider.ts';

/**
 * AZUL (Servicios Digitales Popular) adapter.
 *
 * Verified from AZUL's "E-commerce WebServices v3.2" document (see docs/PAYMENTS.md):
 *  - JSON endpoints: https://pruebas.azul.com.do/webservices/JSON/Default.aspx (test),
 *    https://pagos.azul.com.do/webservices/JSON/Default.aspx (production, alternate host contpagos.azul.com.do)
 *  - Auth: `Auth1`/`Auth2` headers + TLS 1.2 mutual authentication with an AZUL-issued client certificate.
 *  - Amounts in minor units without separators; `ITBIS` included in `Amount`.
 *  - VerifyPayment by `CustomOrderId`; Refund by `AzulOrderId` + `OriginalDate` (yyyymmdd).
 *
 * Card entry must happen on AZUL's hosted "Página de Pago" (keeps card data out of
 * our servers). Its form fields and AuthHash recipe are defined in a separate AZUL
 * document that is delivered during merchant onboarding; until that mapping is
 * filled in and certified with AZUL, createCheckout() refuses to run instead of
 * guessing. The status of a returning customer is never trusted: verifyReturn()
 * calls VerifyPayment server-to-server.
 */
export class AzulProvider implements PaymentProvider {
  readonly name = 'azul';
  readonly hostedPageOrigin: string;
  private readonly endpoint: string;
  private agent: Agent | null = null;

  constructor(private readonly cfg: Config) {
    const prod = cfg.AZUL_ENV === 'production';
    this.endpoint = prod ? 'https://pagos.azul.com.do/webservices/JSON/Default.aspx' : 'https://pruebas.azul.com.do/webservices/JSON/Default.aspx';
    this.hostedPageOrigin = prod ? 'https://pagos.azul.com.do' : 'https://pruebas.azul.com.do';
  }

  private ready(): void {
    const c = this.cfg;
    const missing = [!c.AZUL_MERCHANT_ID && 'AZUL_MERCHANT_ID', !c.AZUL_STORE && 'AZUL_STORE', !c.AZUL_AUTH1 && 'AZUL_AUTH1', !c.AZUL_AUTH2 && 'AZUL_AUTH2', !c.AZUL_CERT_PATH && 'AZUL_CERT_PATH', !c.AZUL_KEY_PATH && 'AZUL_KEY_PATH'].filter(Boolean);
    if (missing.length) throw new ProviderNotReadyError('AZUL', `faltan credenciales (${missing.join(', ')})`);
    if (!this.agent) this.agent = new Agent({ cert: readFileSync(c.AZUL_CERT_PATH!), key: readFileSync(c.AZUL_KEY_PATH!), minVersion: 'TLSv1.2' });
  }

  private call(body: Record<string, unknown>, query = ''): Promise<Record<string, unknown>> {
    this.ready();
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = request(
        `${this.endpoint}${query}`,
        { method: 'POST', agent: this.agent!, headers: { 'Content-Type': 'application/json', Auth1: this.cfg.AZUL_AUTH1!, Auth2: this.cfg.AZUL_AUTH2!, 'Content-Length': Buffer.byteLength(payload) }, timeout: 30_000 },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`AZUL: invalid JSON response (${res.statusCode})`));
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('AZUL: timeout')));
      req.end(payload);
    });
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    this.ready();
    void input;
    throw new ProviderNotReadyError('AZUL', 'la Página de Pago (campos del formulario y AuthHash) debe configurarse con la especificación oficial entregada por AZUL');
  }

  async verifyWebhook(): Promise<ProviderEvent> {
    throw new WebhookVerificationError('AZUL Payment Page returns via redirect; use verifyReturn() (server-side VerifyPayment).');
  }

  /** Customer returned from AZUL: confirm with VerifyPayment using our own order id. */
  async verifyReturn(query: Record<string, string>): Promise<ProviderEvent | null> {
    const orderId = query.OrderNumber ?? query.CustomOrderId;
    if (!orderId || !/^[A-Za-z0-9-]{4,64}$/.test(orderId)) return null;
    const r = await this.call({ Channel: this.cfg.AZUL_CHANNEL, Store: this.cfg.AZUL_STORE, CustomOrderId: orderId }, '?VerifyPayment');
    if (r.Found !== true && r.Found !== 'true') return null;
    const approved = String(r.IsoCode ?? '') === '00';
    return {
      eventId: `azul_verify_${orderId}_${String(r.AzulOrderId ?? '')}`,
      type: approved ? 'payment.succeeded' : 'payment.failed',
      providerReference: orderId,
      amountMinor: Number(r.Amount ?? 0),
      currency: 'DOP',
      raw: { ...r, CardNumber: undefined },
      failureReason: approved ? undefined : String(r.ResponseMessage ?? 'declined'),
    };
  }

  async refund(p: { providerReference: string; amountMinor: number; itbisMinor: number; paidAt: Date | null; metadata: Record<string, unknown> }) {
    const azulOrderId = String(p.metadata.azulOrderId ?? '');
    if (!azulOrderId || !p.paidAt) return { ok: false, message: 'AzulOrderId/fecha original no disponibles' };
    const d = p.paidAt;
    const original = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const r = await this.call({ Channel: this.cfg.AZUL_CHANNEL, Store: this.cfg.AZUL_STORE, PosInputMode: 'E-Commerce', TrxType: 'Refund', Amount: String(p.amountMinor), ITBIS: String(p.itbisMinor), OriginalDate: original, AzulOrderId: azulOrderId });
    return { ok: String(r.IsoCode ?? '') === '00', reference: String(r.AzulOrderId ?? ''), message: String(r.ResponseMessage ?? '') };
  }
}
