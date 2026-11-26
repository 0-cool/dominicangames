# Architecture — DominicanGames (first title: Santo Domingo Open World)

> Since 23 Nov 2026 the project is **DominicanGames — One platform. Multiple worlds.**: a free multi-game platform.
> Santo Domingo Open World is its first game module. Integration log: `DOMINICANGAMES_INTEGRATION.md`; how to add
> games: `GAME_INTEGRATION.md`; brand: `BRAND.md`; optional revenue (off): `MONETIZATION.md`.

## 1. System overview

```
                 ┌──────────────────────────── Browser ─────────────────────────────────┐
                 │  React SPA (apps/web) — DominicanGames                               │
                 │   ├─ platform: home, catalog, game pages, community, dashboard,      │
                 │   │   auth, profile, settings, support, legal, admin                 │
                 │   └─ game modules (games/registry.tsx)                               │
                 │        Santo Domingo Open World: /jugar (launcher) → /juego (lazy)   │
                 │          └─ @sd/game engine (three.js r187 + Rapier WASM)            │
                 └──────────────┬──────────────────────────────┬────────────────────────┘
                     JSON API (cookies + CSRF)         world chunks (GLB/JSON, signed-in players)
                                │                              │
                 ┌──────────────▼──────────────────────────────▼────────────────────────┐
                 │  Fastify API (apps/server) — Node 22 — modular monolith               │
                 │   DOMINICANGAMES CORE (platform/*): identity · catalog · launch auth  │
                 │   · play sessions · achievements · rankings · announcements ·         │
                 │   dashboard · SEO (robots, sitemap, per-route head) · admin           │
                 │   GAME MODULES (games/*): santo-domingo-open-world API + logic        │
                 │   DG MONETIZATION (monetization/*): payments engine — OFF             │
                 └───────┬──────────────────────┬───────────────────────┬───────────────┘
                         │                      │                       │
                  PostgreSQL 16          Payment provider         SMTP provider
                  (Drizzle ORM)        (only for legacy RD$100   (verification,
                                        purchases; checkout off)  reset)
```

World data is produced offline by `tools/world-builder` from an OpenStreetMap extract
(`data/osm/sd_osm_slice.json.gz`) and written to `apps/server/game-data/world/`. The API
serves it to any signed-in, active DominicanGames account while the game is published (`GET /api/game/assets/*`).

## 2. Repository layout

| Path | Package | Purpose |
|---|---|---|
| `packages/shared` | `@sd/shared` | Zod schemas (auth, settings, saves, tickets, **platform contracts**: catalog, profile, avatars, achievements, rankings, announcements), world data types, geo projection. Used by web, server, game and tools so validation is identical on both sides. |
| `packages/game` | `@sd/game` | The engine: renderer, atmosphere, streaming, physics, player, vehicles, traffic, pedestrians, audio, missions. No React, no network code (the host passes `fetchAsset`). |
| `apps/web` | `@sd/web` | React 19 + React Router 7 + Zustand + Tailwind 4 SPA: DominicanGames platform (`pages/*`, `platform/*` client SDK, `components/brand/*`), web game modules (`games/*`), the Santo Domingo Open World host/HUD (`game/*`), admin panel. Vite 8 build. |
| `apps/server` | `@sd/server` | Fastify 5 API: DominicanGames Core (`platform/*`), game modules (`games/*`), DG Monetization (`monetization/*`, off) over the payment engine (`services/payments/*`), Drizzle ORM + reversible migrations + backups, mailer, admin CLI. |
| `tools/world-builder` | `@sd/world-builder` | OSM → road graph, surfaces, buildings, props, landmarks → 116 GLB chunks + JSON. |
| `e2e` | — | Playwright end-to-end tests (site, API security, full purchase-and-play journey). |
| `docs` | — | This documentation. |

## 3. Frontend

* **Routing** (`apps/web/src/router.tsx`): immersive public pages (`/`, `/juegos/:id`), site pages, guest-only auth pages, `RequireAuth` and `RequireAdmin` guards, plus the routes each web game module registers (`games/registry.tsx`). There is no paid-access guard any more. Guards are UX only — the server enforces every rule again.
* **State**: `useAuth` (Zustand) holds the current `PublicUser` (one DominicanGames identity: username, avatar, ranking visibility, locale, Fundador badge); the catalog is fetched once and cached (`platform/catalog.ts`); pages use the typed `Api` client (`lib/api.ts`), which attaches the CSRF token and retries once if the token rotated.
* **Platform SDK for games**: `PlaySession` (`platform/session.ts`) records launches/heartbeats/exits; `useSeo` (`platform/seo.ts`) keeps titles, descriptions, canonical and Open Graph in sync during client navigation.
* **Code splitting**: each game engine is a lazy chunk loaded only on its own route (`/juego`); game page sections and the admin panel are lazy too.
* **Game host** (`game/GameScreen.tsx`): loads settings, save and mission progress from the API, constructs `Game` with `fetchAsset = fetch('/api/game/assets/…')`, renders the HUD (React overlay at 15 Hz), minimap/full map (pre-rendered 2D map canvas from `map.json` + `roads.json`), pause menu, settings with live apply, mission-complete screen, autosave (engine emits a save every 60 s, on mission completion, on tab hide and on exit).
* **Platform integration in the game**: the host starts a `PlaySession` when the player clicks to play, ends it on exit/tab close, and the pause menu offers “Volver a DominicanGames” (save → end session → `/panel`). The loading screen shows “DominicanGames presenta”.
* **i18n**: in-game UI strings live in `src/i18n` (Spanish, English prepared). Platform copy is Spanish; `users.locale` stores the preference and English pages are planned under `/en` (hreflang tags are already emitted). Engine mission text and dialogue are Spanish.

## 4. Game engine (`packages/game`)

| Module | Responsibility |
|---|---|
| `engine/Game.ts` | Orchestrates init, fixed-step simulation (60 Hz, ≤4 sub-steps) and variable-rate rendering, HUD snapshots, events, saves, debug hooks (dev/e2e builds only). |
| `engine/Renderer.ts` | WebGL2 renderer, presets, shadows, EffectComposer chain (Render → GTAO (ultra) → Unreal bloom → Output (ACES) → colour grade → SMAA), dynamic resolution, HDR clamp. |
| `render/Atmosphere.ts` | Real solar position for Santo Domingo, sky shader, clouds, fog, IBL refresh, weather state machine (clear/cloudy/rain), wetness, lightning. |
| `render/textures.ts`, `render/materials.ts` | GPU-baked procedural textures; shader-patched PBR materials (procedural façades with windows/shutters/rejas, wet roads, puddles, ripples, water, foliage sway). |
| `world/WorldStreamer.ts` | Streams 250 m chunks around the player (GLB + props JSON), builds instanced props, shop signs, wires, street lights and physics colliders within 320 m. |
| `physics/Physics.ts` | Rapier world, collision layers, ray casts. |
| `gameplay/Player.ts` | Kinematic character controller (walk, sprint, jump, crouch), interactions, entering/exiting/stealing vehicles, drowning respawn. |
| `vehicles/*` | Ray-cast vehicles with torque curve, gearbox, grip-limited steering; motorcycles with roll lock, visual lean and crashes; 10 original models. |
| `ai/RoadNetwork.ts`, `ai/Traffic.ts`, `ai/Pedestrians.ts` | Lane graph with junction connectors and two-phase signals, A* routing for GPS, IDM car following, kinematic traffic pool; pedestrians on sidewalks with crossings, fleeing and colmado scenes. |
| `audio/Audio.ts` | Synthesised WebAudio: engines, horns, crashes, footsteps, ambience, original procedural bachata/merengue loops from colmados. |
| `gameplay/Missions.ts`, `gameplay/Landmarks.ts` | Mission 001 “Bienvenido a Santo Domingo”, the Malecón time trial, GPS route ribbon, player waypoints, landmark discovery rewards. |

Coordinate system: 1 unit = 1 m, +X east, +Z south, +Y up, origin 18.47 N / −69.891 W
(local equirectangular projection, `@sd/shared/geo.ts`). Saves store compass headings.

## 5. Backend

* **Fastify 5** with `@fastify/helmet` (strict CSP incl. `'wasm-unsafe-eval'` for Rapier), `@fastify/rate-limit` (per IP, per route, scalable with `RATE_LIMIT_SCALE`), `@fastify/cookie`, compression, optional static SPA serving.
* **Sessions**: 256-bit opaque tokens in an HttpOnly, SameSite=Lax cookie; only the SHA-256 hash is stored; rolling expiry; all sessions revoked on password reset and on suspension.
* **CSRF**: HMAC-bound double-submit token (`X-CSRF-Token`) plus an `Origin` check on every state-changing `/api/*` request. Payment webhooks are exempt and authenticated by signature instead.
* **Passwords**: Argon2id (m=19456 KiB, t=2, p=1), login lockout after 8 failures in 15 minutes, constant-shape responses (no user enumeration).
* **Game access**: `requireGameAccess(req, ctx, gameId)` — signed-in, non-suspended account + playable catalog entry (`published`, or `development` for admins). No payment, subscription or e-mail verification is required.
* **DominicanGames Core** (`src/platform`): `catalog.ts` (cached catalog + admin CRUD), `sessions.ts` (launch tracking), `achievements.ts`, `community.ts` (rankings + announcements), `dashboard.ts`, `seo.ts`, `modules.ts` (the `GameModule` contract). Game modules live in `src/games/<id>/` and are listed in `src/games/index.ts`.
* **DG Monetization** (`src/monetization`): one switch (`MONETIZATION_ENABLED=false`) over the preserved payment engine — provider adapters behind `PaymentProvider`, `PaymentService` state machine (see `MONETIZATION.md` / `PAYMENTS.md`). Checkout answers `410` while off.
* **SEO**: in production the SPA fallback injects per-route `<head>` tags (title, description, canonical, hreflang, Open Graph, Twitter, JSON-LD `Organization`/`WebSite`/`VideoGame`) into `index.html`; `robots.txt` and `sitemap.xml` are generated from the catalog.
* **Data**: Drizzle schema in `src/db/schema.ts`; SQL migrations in `apps/server/drizzle/` (with hand-written rollbacks in `drizzle/rollback/`) applied at boot (`MIGRATE_ON_START`) or with `npm run db:migrate`; a JSON backup of every table is written to `backups/` before pending migrations (`src/db/maintenance.ts`).

## 6. Data model (PostgreSQL)

Identity: `users` (+ `avatar`, `show_in_rankings`, `locale`), `sessions`, `email_tokens`, `login_attempts`.
Platform: `games` (catalog), `game_sessions` (launches), `user_achievements`, `announcements`.
Per-game data keyed by `(user_id, game_id)`: `player_saves`, `mission_progress`, `game_settings`.
Legacy purchases (kept, never gate gameplay): `payments`, `webhook_events` (unique provider+event id → idempotency),
`game_access` (RD$100 lifetime access → Fundador badge).
Operations: `audit_logs`, `error_logs`, `support_tickets`, `dev_emails` (development only).

## 7. Architecture decision records

### ADR-001 — WebGL 2 first, WebGPU later
three.js r187's WebGPU renderer still requires a different material/post-processing stack (TSL nodes). Every
material in this project uses `onBeforeCompile` GLSL patches and the classic `EffectComposer`. WebGL 2 runs
on every target browser today; capability detection already reports WebGPU-capable browsers. Migrating to
`WebGPURenderer` + TSL is planned once the visual feature set is frozen (see ROADMAP).

### ADR-002 — Imperative three.js instead of React Three Fiber
The engine streams and mutates tens of thousands of instances per frame, runs a fixed-step physics loop and
must be testable headless with deterministic stepping. Keeping it framework-free avoids React reconciliation
in the hot path and lets the same engine run in the harness, tests and the React host. React owns only the
HUD and menus.

### ADR-003 — Drizzle ORM instead of Prisma
Prisma's CLI downloads native engine binaries from `binaries.prisma.sh`, which was unreachable from the build
environment. Drizzle is pure TypeScript, generates plain SQL migrations (reviewable in git) and has no binary
dependency. Switching to Prisma later only requires re-expressing `schema.ts`; the SQL schema is the contract.

### ADR-004 — Custom GLB chunks from OSM instead of hand-built levels
Geographic accuracy comes from OpenStreetMap (ODbL). The builder produces per-chunk GLBs with merged layers
(ground, asphalt, pavers, sidewalks, markings, walls, roofs, stone, …) and a compound collider, plus JSON
instance lists for props. Where OSM has no building footprints, the
builder generates **procedural infill** buildings (5,484 of the 8,202 buildings in this slice) that respect real block outlines; they are disclosed as such
on the Credits page and do not represent specific real buildings.

### ADR-005 — Hosted payment pages only
No card data ever reaches our servers (no PCI DSS SAQ-D scope). AZUL “Página de Pago” and CardNET “Botón de
Pago” are hosted flows; the server records a purchase only after a provider-verified confirmation. (Since ADR-007
no purchase is required to play.)

### ADR-006 — Procedural, original assets
Textures, façades, vehicles, characters, signage and music are generated from code, so there are no third-party
asset licences to manage and no risk of shipping copyrighted material. Business names are fictional.

### ADR-007 — Free platform; monetization optional and switched off
The RD$100 paywall was removed (strategic change to DominicanGames). Game access depends only on a signed-in
account and the catalog status. The payment engine was preserved behind DG Monetization (off) because it is
provider-agnostic, tested and reusable for future optional products; deleting it would have thrown away work and the
audit trail of legacy purchases.

### ADR-008 — Modular monolith with game modules
One API process and one SPA host the platform core and every game (`GameModule` / `WebGameModule` contracts).
This keeps infrastructure costs flat (no new services) while letting each game own its API, data and lazy client
bundle. Splitting a game into its own service later only requires moving its module behind the same HTTP paths.

### ADR-009 — Catalog in the database, rich game pages in code
Catalog metadata (status, texts, images, launch path, theme) is admin-editable so publishing or announcing a game
needs no deploy. Game-specific marketing sections (e.g. the city areas of Santo Domingo) live in the web game module
because they are content the game team owns and ships with the game.

### ADR-010 — Per-game data with a backfilled `game_id`
Saves, settings and mission progress gained a `game_id` with a temporary default so every existing row was attributed
to Santo Domingo Open World in the same migration that introduced the catalog. The migration is reversible and is
preceded by an automatic JSON backup.
