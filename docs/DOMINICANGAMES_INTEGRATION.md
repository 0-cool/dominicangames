# DominicanGames — Platform Integration (audit, plan and migration log)

> Strategic update (23 Nov 2026): **SANTO DOMINGO — OPEN WORLD** becomes **Santo Domingo Open World**, the first
> official title of **DominicanGames — _One platform. Multiple worlds._** Access is now **free**: the RD$100 gate
> is permanently removed. This document records the audit of the existing repository (Phase 1), the integration
> plan, and what was changed in each phase.

---

## 1. Audit of the existing repository (before any change)

A source backup of the pre-migration state was written to
`backups/pre-dominicangames-source-2026-11-23.tar.gz` (everything except `node_modules`, the generated world
data and `.env`).

### 1.1 What already worked (and is preserved)

| Area | State before | Evidence |
|---|---|---|
| Game engine (`packages/game`) | Complete: streaming city from OSM, physics, player, 10 vehicles, traffic, pedestrians, day/night, rain, audio, Mission 001, Malecón time trial, landmarks | 5 engine tests, e2e journey |
| World builder (`tools/world-builder`) | OSM → 116 GLB chunks (236 named streets, 8,202 buildings, 1,417 fictional shops, 15 landmarks) | `npm run world:build` (≈23 s) |
| Accounts | Register, login, logout, email verification, password reset/change, sessions (SHA-256 hashed opaque tokens), CSRF, lockout, rate limits | 15 API tests |
| Saves | `player_saves` (one JSON save per user), `mission_progress`, `game_settings`; autosave every 60 s, on mission completion, tab hide and exit | API + e2e tests |
| Admin | Metrics, users (search, suspend, restore), payments (refund), errors, audit, tickets | API test |
| Payments | Provider abstraction (sandbox complete, AZUL partial, CardNET placeholder), signed webhooks, idempotency, state machine, refunds | API tests |

Baseline before changes: `npm run typecheck` ✅ 5/5 workspaces · `npm test` ✅ 42/42.

### 1.2 Routes (before)

**Web (React Router)** — `/` landing · `/registro` `/entrar` `/recuperar` (guest only) · `/verificar` `/restablecer` ·
`/verifica-tu-correo` `/cuenta` `/perfil` `/ajustes` `/pago` `/pago/resultado` (auth) · **`/jugar` launcher and
`/juego` game screen (paid only)** · `/admin` (admin) · `/terminos` `/privacidad` `/creditos` `/soporte` · 404.

**API (Fastify)** — `/api/auth/*`, `/api/account/*`, `/api/payments/*` (config, checkout, status, webhook, return),
`/sandbox-pay/*`, `/api/game/*` (access, assets, save, missions, settings), `/api/admin/*`, `/api/support/tickets`,
`/api/telemetry/client-error`, `/api/health`, `/api/dev/mailbox` (dev only).

### 1.3 Authentication dependencies

* One `users` table, cookie sessions (`sd_session`), CSRF (`sd_csrf` + `X-CSRF-Token`), guards in
  `apps/server/src/plugins/security.ts` (`requireUser`, `requireVerified`, `requireAccess`, `requireAdmin`).
* The game has **no separate login**: it calls the same API with the same session cookie — nothing to consolidate.

### 1.4 Payment dependencies (the RD$100 gate) — every touchpoint found

| Layer | Where | Behaviour before |
|---|---|---|
| Server guard | `security.ts → requireAccess` | 403 `payment_required` unless `game_access.access_status = 'active'` (also required a verified email) |
| Server routes | `routes/game.ts` | assets, save, missions guarded by `requireAccess` |
| Server identity | `routes/auth.ts → publicUser` | `user.access` derived from `game_access` |
| Server config | `config.ts` | `ACCESS_PRICE_MINOR=10000`, `ACCESS_ITBIS_MINOR=1525` |
| Payment service | `services/payments/service.ts` | RD$100 lifetime product; grants `game_access` on a verified webhook |
| Web guards | `Guards.tsx → RequireAccess` | redirected to `/pago` when `user.access !== 'active'` |
| Web pages | `payment.tsx`, `Landing.tsx` (price section), `auth.tsx` (copy + redirects to `/pago`), `account.tsx`, `Layout.tsx` (“Obtener acceso”, “Comprar acceso”) | purchase journey |
| Legal | `legal.tsx` | “3. Compra del acceso — RD$100.00” |
| Tests | `api.test.ts`, `e2e/*.spec.ts` | asserted the paywall |

### 1.5 Game launch

`/jugar` (LauncherPage: capability check, graphics preset) → `PUT /api/game/settings` → `/juego` (GameScreen, lazy
chunk with three.js + Rapier) → `GET /api/game/settings|save|missions` → `new Game({ fetchAsset: /api/game/assets/* })`.

### 1.6 Database schema (migration `0000_init`)

`users, sessions, email_tokens, payments, webhook_events, game_access, player_saves (unique user_id),
mission_progress (unique user_id+mission_id), game_settings (unique user_id), audit_logs, error_logs,
support_tickets, login_attempts, dev_emails`. None of the game tables knew **which game** a row belonged to.

### 1.7 Save mechanism

`player_saves.save_data` is a versioned JSON (`saveDataSchema`, `version: 1`) validated on both sides; one row per
user. Mission progress is a separate table; settings are per user.

---

## 2. Integration plan (executed)

| Phase | Scope | Status |
|---|---|---|
| 1 | Audit + plan (this document) + source backup | ✅ |
| 2 | Remove the RD$100 gate (server guard, web guards, redirects, copy, legal) — keep payment abstractions behind **DG Monetization** (disabled) | ✅ |
| 3 | DominicanGames brand + design system + navigation | ✅ |
| 4 | Homepage → multi-game platform homepage | ✅ |
| 5 | Game catalog data model (`games` table, admin-editable) + Santo Domingo Open World as first title | ✅ |
| 6 | Unified identity: avatars, profile, per-game data keyed by `(user, game)` | ✅ |
| 7 | Player dashboard with **CONTINUAR JUGANDO** | ✅ |
| 8 | Game module architecture (server + web registries, platform session API) | ✅ |
| 9 | Admin: catalog, users, announcements, analytics | ✅ |
| 10 | QA: unit/integration/e2e (free journey), visual review | ✅ |

Detailed results and decisions are in the sections below and in `docs/ARCHITECTURE.md`,
`docs/GAME_INTEGRATION.md`, `docs/MONETIZATION.md` and `docs/QA_CHECKLIST.md`.

## 3. Key decisions

1. **Free access = signed-in, active account.** No payment, no subscription and no email verification are needed to
   play. Email verification is still sent and encouraged (account recovery, future rankings/competitions), but it no
   longer blocks anything. Suspended accounts remain blocked.
2. **Nothing is deleted from the database.** `payments`, `webhook_events` and `game_access` keep their historical
   rows. Players who bought the old RD$100 access are recognised with the **Fundador** achievement (real data).
3. **Payments are preserved, not active.** The provider abstraction, adapters, signed webhooks, idempotent state
   machine and refunds stay in `services/payments/*`, wrapped by `monetization/` (DG Monetization). With
   `MONETIZATION_ENABLED=false` (default) checkout returns `410 monetization_disabled`; webhooks/refunds for legacy
   payments keep working.
4. **Modular monolith.** One Fastify API = DominicanGames Core (`platform/*`) + game modules (`games/*`). No new
   infrastructure, no new paid service.
5. **Existing game routes are kept**: `/jugar` (launcher) and `/juego` (game). The catalog entry for
   `santo-domingo-open-world` points to `/jugar`.
6. **Per-game data**: `player_saves`, `mission_progress` and `game_settings` gained a `game_id` column
   (default `santo-domingo-open-world`), so every existing save is preserved and attributed to the right game.

## 4. Database migration `0001_dominicangames_platform`

Up (applied automatically by `npm run db:migrate` or at boot with `MIGRATE_ON_START=true`):

* `CREATE TABLE games` (catalog) + seed: Santo Domingo Open World (published, featured), Moto RD, Caribbean Racing,
  Island Survival (`coming_soon`, not playable).
* `CREATE TABLE game_sessions` (launch history → “recently played”, analytics).
* `CREATE TABLE announcements` (+ the announcement that the game is now free).
* `users`: `avatar`, `show_in_rankings`, `locale`.
* `player_saves`, `game_settings`: `game_id` + unique `(user_id, game_id)` instead of unique `(user_id)`.
* `mission_progress`: `game_id` + unique `(user_id, game_id, mission_id)`.

Safety:

* **Automatic backup**: before applying pending migrations, `db:migrate` and the server boot write a JSON dump of every
  table to `backups/db-<timestamp>-before-migrate.json` (`DB_BACKUP_BEFORE_MIGRATE=false` disables it). Manual:
  `npm run db:backup`.
* **Reversible**: `apps/server/drizzle/rollback/0001_dominicangames_platform.down.sql` restores the previous schema
  (keeps the Santo Domingo rows, drops the new tables/columns) and removes the migration record. Run it with
  `npm run db:rollback -- 0001_dominicangames_platform`.
* Tested up → down → up against PostgreSQL 16 with existing saves (see `docs/QA_CHECKLIST.md`).

## 5. What changed, phase by phase

| Phase | Result | Main files |
|---|---|---|
| 2 — Remove RD$100 | `requireAccess` (paywall) removed; `requireGameAccess` = account + catalog status. `/pago` redirects to the game page (“¡Ahora es gratis!”); `/pago/resultado` only shows historical payments; checkout → `410`; RD$100 pricing removed from config; legal texts updated | `plugins/security.ts`, `platform/catalog.ts`, `routes/payments.ts`, `monetization/index.ts`, `config.ts`, `pages/payment.tsx`, `pages/legal.tsx` |
| 3 — Brand | World Grid mark + wordmark, Unbounded (vendored) + Inter, DG Red/Blue on navy, buttons/cards/badges/loaders, header with live “Juegos” menu, footer, favicon, OG image | `styles.css`, `components/brand/*`, `components/ui.tsx`, `components/Layout.tsx`, `docs/BRAND.md` |
| 4 — Homepage | Cinematic hero slideshow of real captures + “en pantalla” location tag, featured game with real launch, catalog (1 available + 3 labelled concepts), why DominicanGames, community (real rankings/announcements, “Próximamente” competitions), final CTA | `pages/Home.tsx`, `components/GameCard.tsx`, `components/platform.tsx` |
| 5 — Catalog | `games` table + admin CRUD; `/juegos`, `/juegos/:id` (generic page + module sections); new cinematic captures rendered with the engine's photo mode | `platform/catalog.ts`, `pages/Catalog.tsx`, `pages/GameDetail.tsx`, `games/santo-domingo-open-world/DetailSections.tsx`, `public/img/games/…` |
| 6 — Identity | Avatars, ranking visibility, locale; per-game saves; sign-up goes straight to the game (verification optional) | `routes/auth.ts`, `pages/account.tsx`, `pages/auth.tsx`, `components/brand/Avatar.tsx` |
| 7 — Dashboard | `/panel`: CONTINUAR JUGANDO, recently played, progress, achievements, games, announcements, purchase history | `platform/dashboard.ts`, `pages/Dashboard.tsx` |
| 8 — Architecture | `GameModule` / `WebGameModule`, `PlaySession` SDK, sessions API, achievements + rankings engine, return-to-platform in the game | `platform/*`, `games/*`, `apps/web/src/platform/*`, `apps/web/src/games/*`, `game/GameScreen.tsx`, `docs/GAME_INTEGRATION.md` |
| 9 — Admin | Overview (platform + per-game analytics + DG Monetization), Juegos (editor), Usuarios (+ verify e-mail, games played), Anuncios, Compras (legado) | `routes/admin.ts`, `pages/admin/Admin.tsx` |
| SEO | Server-injected head per route, JSON-LD, robots, sitemap, client `useSeo` | `platform/seo.ts`, `apps/web/src/platform/seo.ts`, `index.html` |
| 10 — QA | 62 unit/integration tests, 12 e2e (incl. the free journey), production-bundle check, visual review | `docs/QA_CHECKLIST.md` |

## 6. Upgrading an existing installation

1. Pull the new code and run `npm install` (no new npm dependencies were added; the display font is vendored).
2. Update `.env` from `.env.example` (`MONETIZATION_ENABLED=false`, `DB_BACKUP_BEFORE_MIGRATE=true`; the old
   `ACCESS_*` variables are ignored and can be deleted).
3. Start the API (`npm run dev` / `npm start`) or run `npm run db:migrate`: a JSON backup is written to `backups/`,
   then migration 0001 runs. Existing saves now belong to `santo-domingo-open-world`.
4. To undo: `npm run db:rollback -- 0001_dominicangames_platform`, restore the previous code (source backup in
   `backups/pre-dominicangames-source-2026-11-23.tar.gz`) and start with `MIGRATE_ON_START=false`.

## 7. Open business decisions

* How to communicate the change to players who bought the RD$100 access (and whether to offer refunds). The platform
  keeps their history, progress and gives them the Fundador badge; the seeded announcement mentions it.
* Legal review of the updated Terms/Privacy (still drafts) and company data ([RAZÓN SOCIAL], RNC).
* Whether and when to enable any optional monetization (see MONETIZATION.md).
