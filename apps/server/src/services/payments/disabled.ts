import { type CheckoutSession, type PaymentProvider, type ProviderEvent, ProviderNotReadyError, WebhookVerificationError } from './provider.ts';

/**
 * Used when DG Monetization is off and no usable provider is configured (e.g. production without payment
 * credentials). Every operation is refused, so nothing can be charged and no hosted payment page exists.
 */
export class DisabledProvider implements PaymentProvider {
  readonly name = 'disabled';
  readonly hostedPageOrigin = null;

  async createCheckout(): Promise<CheckoutSession> {
    throw new ProviderNotReadyError('DG Monetization', 'los pagos están desactivados');
  }

  async verifyWebhook(): Promise<ProviderEvent> {
    throw new WebhookVerificationError('payments disabled');
  }

  async refund(): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: 'Los pagos están desactivados en esta instalación.' };
  }
}
