# Payments engine (legacy RD$100 access → DG Monetization, switched off)

> **23 Nov 2026 — DominicanGames is free.** The RD$100 access product described below was **discontinued**:
> nothing in this document is required to play any more. The engine is kept, disabled, as the payment layer of
> **DG Monetization** (`MONETIZATION_ENABLED=false`, see [MONETIZATION.md](MONETIZATION.md)): checkout answers
> `410 monetization_disabled`; webhooks, provider returns and admin refunds keep working for payments made before
> the change (a succeeded legacy payment now grants the cosmetic *Fundador* badge, a refund removes it). Sections 1–2
> are kept as the historical description of the product; the provider sections (3–7) still apply to any future
> optional product.

> **Historical status:** the **sandbox** provider is complete and tested end to end. The **AZUL** adapter implements
> the verified server-to-server parts (VerifyPayment, Refund, mutual TLS, `Auth1/Auth2`) but **refuses to
> create real checkouts** until the hosted “Página de Pago” field mapping from AZUL’s merchant onboarding
> package is filled in and certified. **CardNET** is a documented placeholder. No real money can be charged
> by this codebase as delivered — by design.

## 1. Commercial terms (historical — product discontinued)

| Setting | Default | Notes |
|---|---|---|
| ~~`ACCESS_PRICE_MINOR`~~ | ~~`10000`~~ | Removed from the configuration (ignored if still present in an old `.env`). |
| ~~`ACCESS_ITBIS_MINOR`~~ | ~~`1525`~~ | Removed. Future optional products define amount + ITBIS per product (`Product` in `services/payments/service.ts`). |
| Currency | `DOP` | Only DOP is accepted. |
| Access type | `LIFETIME` | One row in `game_access` per user. |
| `REVOKE_ACCESS_ON_REFUND` | `true` | A refund revokes access. |

`GET /api/payments/config` now returns the DG Monetization status (all streams disabled, no products). The amount
and currency of every payment are still enforced when the provider's confirmation arrives.

## 2. Flow

```
Browser                         API                                 Provider
  │ POST /api/payments/checkout  │                                    │
  │ {idempotencyKey}  ─────────▶ │ requireVerified; 409 if paid       │
  │                              │ reuse open checkout < 30 min       │
  │                              │ INSERT payments(status=created)    │
  │                              │ provider.createCheckout ─────────▶ │ hosted payment page
  │ ◀──── {paymentId, redirectUrl}│ status=pending                     │
  │ ── redirect to hosted page ─────────────────────────────────────▶ │ card entered HERE only
  │                              │ ◀──── signed webhook / verify ──── │
  │                              │ verify signature + timestamp       │
  │                              │ BEGIN; INSERT webhook_events       │ (unique → duplicates ignored)
  │                              │ SELECT payment FOR UPDATE          │
  │                              │ amount/currency check              │
  │                              │ allowed transition?                │
  │                              │ UPDATE payment; UPSERT game_access │
  │                              │ audit log; COMMIT; receipt email   │
  │ ◀──── redirect to /pago/resultado?id=…                            │
  │ GET /api/payments/:id (poll) │ shows server truth only            │
```

Key properties (all covered by `apps/server/test/api.test.ts`):

* **Access is never granted from the browser.** `/pago/resultado` only displays what the server recorded.
* **Signature + freshness**: sandbox webhooks carry `X-SD-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "t.rawBody")>`; 5-minute tolerance; constant-time comparison; the raw body is verified before parsing.
* **Idempotency**: `webhook_events (provider, event_id)` is unique; a replayed event returns `duplicate`. Checkout requests carry a client UUID; the same key returns the same payment.
* **Amount mismatch** → recorded, no access (`amount_mismatch`).
* **State machine**: `created → pending → succeeded | failed | canceled`, `succeeded → refunded`. Other transitions are ignored and logged.
* **No card data** is ever received, logged or stored. Payment rows hold amount, currency, status, provider reference and non-sensitive metadata.
* Every transition writes an `audit_logs` row; webhook rejections write `error_logs`.

## 3. Sandbox provider (`PAYMENT_PROVIDER=sandbox`)

* Hosted page at `/sandbox-pay/<ref>` with a red banner “ENTORNO DE PRUEBAS — NO SE PROCESARÁ NINGÚN PAGO REAL”, and buttons to **approve**, **decline** or **cancel**.
* The page posts to the server, which builds a provider-style event, **signs it** with `SANDBOX_WEBHOOK_SECRET` and delivers it through the same webhook endpoint a real provider would use — so the production code path (verification, idempotency, transactions) is exercised.
* The server refuses to start with `PAYMENT_PROVIDER=sandbox` when `NODE_ENV=production` unless `ALLOW_SANDBOX_IN_PRODUCTION=true` (for a staging environment only).

## 4. AZUL (Servicios Digitales Popular)

Facts verified from AZUL’s *E-commerce WebServices* documentation and encoded in `services/payments/azul.ts`:

* JSON web services: `https://pruebas.azul.com.do/webservices/JSON/Default.aspx` (test) and `https://pagos.azul.com.do/webservices/JSON/Default.aspx` (production).
* Authentication: HTTP headers `Auth1` / `Auth2` **plus** TLS 1.2 mutual authentication with a client certificate issued by AZUL (`AZUL_CERT_PATH`, `AZUL_KEY_PATH`).
* Amounts in minor units without separators; `ITBIS` sent separately and included in `Amount`.
* `?VerifyPayment` by `CustomOrderId` (used to confirm a returning customer server-to-server — the redirect parameters are never trusted).
* Refund: `TrxType: "Refund"` with `AzulOrderId` and `OriginalDate` (yyyymmdd).

**Not implemented on purpose (needs AZUL onboarding):** the hosted **Página de Pago** request fields and its
`AuthHash` recipe are defined in a separate document AZUL delivers to merchants. `createCheckout()` throws
`ProviderNotReadyError` until that mapping is added and certified, instead of guessing an integration.

### Go-live checklist (AZUL)
1. Sign the merchant agreement; obtain Merchant ID, Store, Channel, `Auth1`/`Auth2` and the client certificate.
2. Implement `createCheckout()` with the Página de Pago spec (redirect URL, `OrderNumber` = our payment id, `Amount`, `ITBIS`, approved/declined/cancel URLs → `${APP_ORIGIN}/api/payments/return/azul`, `AuthHash`).
3. Map the return to `verifyReturn()` (already calls VerifyPayment) and store `AzulOrderId` in `payments.metadata` for refunds.
4. Run AZUL’s certification test matrix in `AZUL_ENV=test`; keep evidence.
5. Set `PAYMENT_PROVIDER=azul`, `AZUL_ENV=production`, rotate secrets, deploy, perform a real RD$100 purchase and refund.
6. Configure monitoring for `error_logs` entries containing `webhook rejected` / `AZUL`.

## 5. CardNET

CardNET’s REST “integración sin pantalla” requires the merchant server to transmit card numbers and CVV, which
would put the platform in full PCI DSS scope. The supported path is CardNET’s hosted **Botón de Pago**; its
session/redirect/verification contract must come from CardNET’s current merchant documentation. The adapter
(`cardnet.ts`) refuses to run until then.

## 6. Tax and receipts (Dominican Republic)

* The receipt email states that it is **not** a fiscal invoice with NCF. If you need to issue comprobantes fiscales
  (NCF / e-CF) to customers, integrate your DGII-authorised invoicing provider — not included.
* ITBIS is included in the RD$100 price by default; confirm the rate and treatment for digital services with an accountant.

## 7. Operations

* **Refunds**: Admin → Pagos → “Reembolsar” calls `PaymentService.refund()` (provider refund + `refunded` status + access revocation + audit).
* **Stuck pending payments**: the result page polls for 90 s, then tells the user to check “Mi cuenta”. A provider confirmation that arrives later still activates access.
* **Reconciliation**: export `payments` where `status='succeeded'` and match `provider_reference` against the provider’s settlement report.
