# DG Monetization — optional revenue, never a gate

> **Status (23 Nov 2026): OFF.** DominicanGames is free. Registration, login and playing Santo Domingo Open World
> require no payment, no subscription and no payment details. No advertisement, sponsor or purchase is shown.

The former business model (a mandatory RD$100 lifetime access) was **removed**. What remained useful was kept as
reusable infrastructure behind a single switch, so future *optional* revenue can be added without touching game
access.

## Module map

| Stream | State | Where / how it would plug in |
|---|---|---|
| Payments (hosted provider pages, signed webhooks, idempotent state machine, refunds) | Built, **disabled** (`MONETIZATION_ENABLED=false`) | `apps/server/src/services/payments/*` (engine), `apps/server/src/monetization/index.ts` (switch + product catalogue), `routes/payments.ts` |
| Optional products (premium membership, virtual currency, cosmetics) | None defined | `Product` type in `services/payments/service.ts`; pass products to `buildApp({ products })` / the `Monetization` constructor. Grant logic goes in `PaymentService.processEvent` (`entitlement.granted` audit already emitted) |
| Display / rewarded video advertising | Not integrated | Add a provider adapter in `monetization/`, expose `ads.enabled` in `status()`, render slots only when enabled and never inside gameplay without the player's choice (rewarded ads must be opt-in) |
| Direct sponsorships, sponsored tournaments | Not integrated | Catalog/announcement fields + admin tooling; no sponsor logos are shown today |
| Developer revenue share (marketplace) | Not designed | Needs payouts, contracts and tax handling first |
| Revenue analytics | Historical only | Admin → Resumen shows legacy revenue and payment states; Admin → Compras (legado) |

## Rules (enforced in code and review)

1. Nothing is ever required to play a published game — `requireGameAccess` has no payment check.
2. With the switch off, `POST /api/payments/checkout` answers `410 monetization_disabled` and `GET /api/payments/config`
   reports every stream as disabled; the web app has no purchase UI.
3. No fake ads, fabricated sponsor logos or invented purchases.
4. Turning anything on requires: product definitions, a real provider (AZUL/CardNET certification — see PAYMENTS.md),
   updated Terms/Privacy, legal + tax review (ITBIS, NCF), and an admin view for the new revenue.

## Legacy RD$100 purchases

* Rows in `payments`, `webhook_events` and `game_access` are kept untouched (fiscal/accounting record).
* Those accounts get the cosmetic **Fundador** achievement/badge (`founder: true` in the public user).
* Late provider confirmations of checkouts started before the change still resolve (they grant the badge).
* Admin → Compras (legado) can still refund them; a refund removes the badge — the game remains free for that account.
* Communication and any refund policy for these buyers is a business decision (see the announcement seeded in
  migration 0001).
