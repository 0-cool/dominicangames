/**
 * Payment provider adapter contract. Providers never receive card data from us:
 * card entry always happens on the provider's hosted page (PCI scope stays with
 * the provider). Payment status changes are only accepted from authenticated
 * provider → server messages (signed webhooks or server-to-server verification).
 */
export interface CheckoutInput {
  paymentId: string;
  orderNumber: string;
  amountMinor: number;
  itbisMinor: number;
  currency: 'DOP';
  description: string;
  customerEmail: string;
  returnUrl: string;
}

export interface CheckoutSession {
  providerReference: string;
  redirectUrl: string;
}

export interface ProviderEvent {
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.canceled' | 'payment.refunded';
  providerReference: string;
  amountMinor: number;
  currency: string;
  raw: unknown;
  failureReason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly hostedPageOrigin: string | null;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verify an inbound webhook (signature, timestamp, schema). Throws on invalid input. */
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<ProviderEvent>;
  /** Optional server-to-server verification after the customer returns (redirect-based providers). */
  verifyReturn?(query: Record<string, string>): Promise<ProviderEvent | null>;
  refund(p: { providerReference: string; amountMinor: number; itbisMinor: number; paidAt: Date | null; metadata: Record<string, unknown> }): Promise<{ ok: boolean; reference?: string; message?: string }>;
}

export class ProviderNotReadyError extends Error {
  constructor(provider: string, missing: string) {
    super(`${provider} no está listo para cobrar: ${missing}. Ver docs/PAYMENTS.md.`);
  }
}

export class WebhookVerificationError extends Error {}
