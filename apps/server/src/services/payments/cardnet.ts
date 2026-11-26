import type { PaymentProvider, ProviderEvent, CheckoutSession } from './provider.ts';
import { ProviderNotReadyError, WebhookVerificationError } from './provider.ts';

/**
 * CardNET adapter placeholder.
 *
 * CardNET publishes developer guides at developers.cardnet.com.do. Its REST
 * "integración sin pantalla" requires the merchant server to transmit card
 * numbers and CVV, which would put this platform in full PCI DSS scope — the
 * project explicitly avoids that. The supported path is CardNET's hosted
 * "Botón de Pago"; its session/redirect/verification contract must be taken
 * from CardNET's current documentation and your merchant onboarding package
 * before this adapter can be implemented. Until then it refuses to run.
 */
export class CardnetProvider implements PaymentProvider {
  readonly name = 'cardnet';
  readonly hostedPageOrigin = null;
  async createCheckout(): Promise<CheckoutSession> {
    throw new ProviderNotReadyError('CardNET', 'el Botón de Pago hospedado aún no está integrado (requiere la documentación del comercio)');
  }
  async verifyWebhook(): Promise<ProviderEvent> {
    throw new WebhookVerificationError('CardNET adapter not implemented');
  }
  async refund() {
    return { ok: false, message: 'CardNET adapter not implemented' };
  }
}
