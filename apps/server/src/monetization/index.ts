import type { Config } from '../config.ts';
import type { PaymentService, Product } from '../services/payments/service.ts';

/**
 * DG MONETIZATION — the single place where every future, OPTIONAL revenue stream plugs in:
 *
 *   payments        provider-agnostic checkout + verified webhooks (services/payments/*)   → built, OFF
 *   products        optional products (premium membership, virtual currency, cosmetics)   → none defined
 *   ads             display / rewarded video advertising                                  → not integrated, OFF
 *   sponsorships    direct brand sponsorships / sponsored tournaments                     → not integrated, OFF
 *   revenue share   future developer marketplace                                          → not integrated
 *   analytics       revenue reporting (payments table + audit log)                        → admin “legacy” view
 *
 * Rules for this phase (see docs/MONETIZATION.md): nothing is required to play, no purchase is active, no payment
 * details are requested, no advertisement or sponsor is shown. Turning anything on requires configuration
 * (MONETIZATION_ENABLED + products/providers) and a policy review — never a code path that blocks gameplay.
 */
export interface MonetizationStatus {
  enabled: boolean;
  payments: { enabled: boolean; provider: string; sandbox: boolean; products: PublicProduct[] };
  ads: { enabled: false };
  sponsorships: { enabled: false };
  virtualCurrency: { enabled: false };
}

export type PublicProduct = Pick<Product, 'code' | 'title' | 'description' | 'amountMinor' | 'currency' | 'kind'>;

export class Monetization {
  constructor(
    private readonly cfg: Config,
    readonly payments: PaymentService,
    private readonly products: readonly Product[] = [],
  ) {}

  get enabled(): boolean {
    return this.cfg.MONETIZATION_ENABLED;
  }

  /** An optional product that can be bought right now (null when monetization is off or the code is unknown). */
  product(code: string): Product | null {
    if (!this.enabled) return null;
    return this.products.find((p) => p.code === code) ?? null;
  }

  status(): MonetizationStatus {
    const provider = this.payments.provider.name;
    return {
      enabled: this.enabled,
      payments: {
        enabled: this.enabled && provider !== 'disabled',
        provider,
        sandbox: provider === 'sandbox',
        products: this.enabled ? this.products.map(({ code, title, description, amountMinor, currency, kind }) => ({ code, title, description, amountMinor, currency, kind })) : [],
      },
      ads: { enabled: false },
      sponsorships: { enabled: false },
      virtualCurrency: { enabled: false },
    };
  }
}
