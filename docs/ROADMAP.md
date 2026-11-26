# Roadmap and milestone status

Legend: ✅ done and tested · 🟡 done with known limitations · ⏳ not started / external dependency

## DG-1 — DominicanGames platform (23 Nov 2026) ✅
* ✅ RD$100 paywall removed: free registration, login and play; checkout disabled behind DG Monetization.
* ✅ DominicanGames brand + design system (World Grid mark, Unbounded/Inter, DG Red/Blue, cinematic in-game imagery).
* ✅ Homepage as a multi-game platform; catalog (`/juegos`), game pages, community, player dashboard (`/panel`).
* ✅ Game catalog data model (admin-managed): Santo Domingo Open World published; Moto RD, Caribbean Racing and
  Island Survival as clearly labelled concepts.
* ✅ One identity for every game: avatars, ranking visibility, per-game saves, play sessions, achievements, rankings,
  announcements; “Volver a DominicanGames” from the game.
* ✅ Game module architecture (server `GameModule`, web `WebGameModule`, `PlaySession` SDK).
* ✅ Admin: catalog editor, users, announcements, platform/game analytics, legacy purchases.
* ✅ SEO: per-route head tags, Open Graph, JSON-LD, robots.txt, sitemap.xml; English-ready structure.
* ✅ Reversible migration with automatic backups; tests (API, migration, e2e free journey).

## M0 — Foundations ✅
* Monorepo (npm workspaces), strict TypeScript, shared Zod schemas, environment validation.
* OpenStreetMap extract for Gazcue – Zona Colonial – Malecón (ODbL), world builder.

## M1 — The city ✅ / 🟡
* ✅ Road graph from OSM (junction splitting, one-ways, lanes, parking flags, signals), union-clipped road and sidewalk surfaces, curbs, markings, crossings.
* ✅ Buildings from OSM footprints with façade styles (colonial, coral stone, Gazcue houses, apartments, commercial, towers, ruins, marble), procedural infill inside real blocks.
* ✅ Landmarks: Catedral Primada, Alcázar de Colón, Fortaleza Ozama, Ruinas de San Francisco, Panteón Nacional, Casas Reales, Hospital San Nicolás de Bari, Palacio Nacional (dome), Puerta del Conde, city walls and gates, Obelisco, Obelisco Hembra, Barrio Chino arches, Parque Colón statue.
* ✅ Street life props: palms, trees, poles and power lines, water tanks, colmados with plastic chairs, coolers and dominoes, 1,417 fictional shops with signs, parked cars and motorcycles.
* 🟡 Landmark models are simplified approximations; Altar de la Patria outline not matched in the extract.

## M2 — Engine ✅
* ✅ Renderer with presets, shadows, bloom, GTAO (ultra), SMAA, colour grade, dynamic resolution, HDR safety clamp.
* ✅ Real solar position, sky, clouds, fog, IBL, day/night, weather (clear/cloudy/rain), wet roads, puddles, lightning.
* ✅ Chunk streaming with physics radius, instanced props, sign atlas, city lights.

## M3 — Gameplay ✅ / 🟡
* ✅ Third-person player: walk, sprint, jump, crouch, interact, drowning respawn.
* ✅ Vehicles: raycast cars with gearbox, motorcycles with lean and crashes; 10 original models; enter/exit; take parked vehicles.
* ✅ Traffic AI (lanes, signals, IDM, spawning, collisions) and pedestrians (sidewalks, crossings, fleeing, colmado scenes).
* ✅ Mission 001 “Bienvenido a Santo Domingo” (Don Ramón, his motorcycle, checkpoints through Puerta del Conde, the Malecón, Fortaleza Ozama, Parque Colón; reward and stats), the Malecón time trial, landmark discovery, GPS and map waypoints.
* ✅ Synthesised audio and original procedural music.
* 🟡 No combat, police, wanted level, NPC dialogue beyond the mission, or vehicle damage visuals beyond the damage meter.

## M4 — Platform ✅ / 🟡
* ✅ Landing, registration, login, email verification, password reset, payment, payment result, launcher, game, account dashboard, profile, settings, terms, privacy, credits, support, admin panel, 404.
* ✅ Sessions, CSRF, rate limits, lockout, audit and error logs, support tickets.
* ✅ RD$100 sandbox payment flow with signed webhooks, idempotency, amount checks, access grant/revoke, refunds.
* 🟡 AZUL: server-to-server verification/refund implemented; hosted page pending AZUL spec + certification. CardNET: placeholder.
* 🟡 Legal texts are drafts pending legal review; fiscal invoices (NCF) not integrated.

## M5 — Quality ✅ / 🟡
* ✅ API integration tests (15) against PostgreSQL; Playwright e2e (site, API security, full journey).
* ✅ Deterministic engine debug hooks for automated play-tests.
* 🟡 Frame-rate verification on real GPUs pending (build environment only had a software rasteriser).

## Next milestones (proposed)

| Milestone | Scope |
|---|---|
| DG-2 — Platform launch readiness | Legal review (terms/privacy for the free platform), SMTP + domain, staging soak test, real-hardware performance pass on 3 reference PCs, admin 2FA, sign-up abuse protection (captcha if needed), English pages under `/en` |
| DG-3 — Community | Weekly challenges and tournaments (server-side validation of results first), player profiles, notifications |
| DG-4 — Second title | Prototype one concept (Moto RD is the natural next step: the engine already has motorcycle physics, leaning and crashes) as a `development` catalog entry |
| DG-5 — Optional monetization (only if decided) | See MONETIZATION.md: optional products/ads with legal + tax review; never required to play |
| M6 — Launch readiness (game) | Real-hardware performance pass, AZUL only if optional products are approved |
| M7 — More Santo Domingo | Extend the OSM slice (Ciudad Nueva, Mercado Modelo, Av. Duarte, Puente Duarte), better landmark models, interiors for colmados |
| M8 — More to do | 5–8 missions (deliveries, motoconcho passenger jobs, races), radio stations with licensed/original Dominican music, phone UI |
| M9 — Tech | WebGPU renderer (TSL), streamed Rapier WASM, LODs/impostors, Brotli-precompressed chunks, touch controls for tablets |
| M10 — English | Translate engine mission text/dialogue; language switch on the site |

## Content ideas for Santo Domingo Open World (inspired by the “GTA 6 si hubiese sido en RD” reference video)

Ideas only — not commitments, not shown as features. Each one is original content about everyday Dominican life,
with fictional businesses (no real brands, no GTA material):

| Idea | Fits milestone | Notes |
|---|---|---|
| Rush hour on a bridge over the Ozama (Puente Duarte / Juan Bosch) | M7 | Needs the OSM slice extended east; traffic AI already supports dense queues |
| Motoconcho rides through colonial gates (Puerta del Conde, Puerta de la Misericordia) | M8 | Passenger jobs on the existing motorcycle physics |
| Traffic police checkpoints (fictional agency, no real insignia) | M8+ | Light “wanted” mechanic; avoid real institutions' symbols |
| Fruit/vegetable trucks and street vendors in barrio streets | M7/M8 | Props + pedestrian scenes like the colmados |
| Flooded streets after a tropical downpour | M9 | Extend the rain system with water depth + vehicle splash |
| Boat ride on the Ozama river | M7+ | Requires the river in the world slice and a boat vehicle |
| Baseball night at a stadium (generic, fictional) | Later | Large landmark + crowd |
| Night life: neon shop signs, a fictional TV studio / radio, city views from a hillside barrio | M8/M9 | The radio stations idea (M8) pairs with this |
