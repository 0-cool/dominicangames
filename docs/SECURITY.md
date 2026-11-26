# Security

## Threat model (summary)

| Asset | Threats | Controls |
|---|---|---|
| Game access (free) | Playing a game that is not published, anonymous scraping of world data | `requireGameAccess` on every game endpoint: signed-in, non-suspended account + playable catalog entry (admins only for `development`); client guards are UX only |
| Catalog & admin data | Open redirects or external content injected through catalog/announcement fields | Zod: launch/link paths must be internal (`/…`, no `//`), images must be site paths (`/img/…`), ids are slugs; React escaping; admin-only routes, every change audited |
| Rankings / public profile | E-mail or personal data leaks, unwanted exposure | Public endpoints return usernames + avatars only; players can opt out (`show_in_rankings`); suspended accounts excluded |
| Legacy purchases (DG Monetization off) | Replayed/forged webhooks, amount tampering | Checkout disabled (`410`); webhooks still verified (signature + freshness + amount/currency, idempotent transaction); a purchase never gates gameplay |
| Accounts | Credential stuffing, brute force, enumeration, session theft | Argon2id, per-IP rate limits, per-account lockout (8 failures / 15 min), identical responses for unknown emails, HttpOnly + SameSite cookies, `Secure` in production, session revocation on reset/suspension |
| Payments data | Card data exposure | Hosted payment pages only; no card data ever reaches the server (ADR-005); no card fields in logs |
| Admin panel | Privilege escalation | `requireAdmin` on every admin route; admins created only from the CLI; all admin actions audited |
| Users | XSS, CSRF, clickjacking | React escaping, strict CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), HMAC double-submit CSRF token + Origin check, `X-Frame-Options`, `Referrer-Policy` via Helmet |
| El Tapón high scores (guests can write) | Forged scores, spam runs, offensive nicknames, impersonation, DB growth | Run registered first (server seed + 192-bit secret, only its SHA-256 stored), finished once by the same account/guest, duration ≤ server time, plausibility rules on every stat, **server replay** of every run that would enter a table or unlock an achievement; per-IP rate limits (keyed hash, no raw IPs stored) and a cap on runs per hour; nickname filter + no account names; admin moderation (Admin → Puntuaciones, audited); unfinished runs purged after a day |
| Infrastructure | Secrets leakage | All secrets from environment variables; `.env` git-ignored; config validation refuses unsafe production settings (sandbox provider, dev mailbox, missing SMTP) |

## Controls in code

* `apps/server/src/plugins/security.ts` — sessions, CSRF, Origin check, guards.
* `apps/server/src/routes/auth.ts` — registration, login lockout, verification and reset tokens (random 256-bit, stored hashed, single-use, expiring).
* `apps/server/src/services/payments/*` — signature verification (constant-time), idempotency, state machine.
* `apps/server/src/app.ts` — Helmet CSP/HSTS, rate limiting, error handler that never leaks stack traces, error logging.
* `apps/server/src/platform/catalog.ts` — `requireGameAccess` (the only gate for game APIs: account + catalog status, no payment).
* `apps/server/src/games/santo-domingo-open-world/api.ts` — path-safe asset serving (whitelisted characters, no `..`, resolved path must stay inside the data directory).
* `apps/server/src/db/maintenance.ts` — JSON backups before migrations, transactional rollbacks.
* `apps/server/src/games/el-tapon/` — arcade runs: secret check, ownership, plausibility (`packages/shared/src/tapon.ts`), replay verifier (`verify.ts`, chunked so it never blocks the API), nickname filter (`names.ts`), moderation endpoints (admin only).
* Inputs are validated with the shared Zod schemas on both client and server; request body limits (save 64 KB, settings 16 KB, El Tapón finish 512 KB).

## Tests

`apps/server/test/api.test.ts` covers CSRF rejection, duplicate accounts, input validation, lockout, password reset
invalidating sessions, **free access for new accounts (no payment, no verification)**, anonymous refusal (401),
unpublished-game refusal, catalog/announcement admin authorisation and input validation (no external links),
session ownership, rankings privacy (opt-out, no e-mails), path traversal, disabled checkout (410), forged/stale/
tampered/duplicate webhooks, amount mismatch, idempotent checkout, legacy purchase confirmation + refund, suspension,
and IP rate limits. `test/migration.test.ts` checks the platform migration up → down → up with existing saves.
`e2e/site.spec.ts` repeats the critical checks against the running stack. `test/tapon.test.ts` covers El Tapón:
guest runs with nickname rules, wrong secrets, double submission, impossible numbers, a forged run caught by the
replay, another account finishing someone's run (403), rankings opt-out, admin-only moderation and the guest-play
switch; `packages/tapon/test/replay.test.ts` checks that replays are exact and that edited inputs are detected.

## Dependency audit

Run `npm audit --omit=dev` before each release. At delivery time `npm audit --omit=dev` reported **0 vulnerabilities**.
The full tree reported 4 moderate advisories, all in development-only tooling (`drizzle-kit` → `@esbuild-kit/*` → old
`esbuild` dev server), which is never deployed.

## Known limitations / to do before launch

* No 2FA for admin accounts (recommended: TOTP for `role=admin`).
* Rate limits are in-memory per process; with several API instances use the Redis store of `@fastify/rate-limit`.
* No automated malware/abuse scanning for support-ticket text (stored as plain text, rendered escaped).
* Penetration test by a third party recommended before a public launch (and before enabling any optional purchase).
* Saves and mission times are reported by the browser (no server-side simulation): rankings can be gamed by a
  determined cheater. Plausibility checks / server-side validation are recommended before competitions with prizes.
* Legal pages are drafts pending review by a Dominican lawyer (Ley 172-13, Ley 358-05).
