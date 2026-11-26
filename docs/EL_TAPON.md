# El Tapón — design and implementation guide

Second DominicanGames title. A desktop-only, side-view 2D arcade game: you are a **motoconchista** weaving
through Santo Domingo's rush-hour *tapón*. Catalog id `el-tapon`; play route `/juegos/el-tapon/jugar`
(guests allowed). Engine: `packages/tapon` (Canvas 2D, no new runtime dependencies; procedural audio reuses the
radio of `@sd/game`).

Rules decided with the owner (23 Nov 2026): the designer defines the rules; **3 cascos** (lives);
**guests may enter the global high-score table with a nickname**.

## 1. Platform and controls (PC only)

* Reference resolution 1920×1080 (16:9), minimum viewport 1280×720. The canvas keeps 16:9 and scales with the
  window (letterbox); there is no mobile/touch mode.
* `W` / `↑` upper lane · `S` / `↓` lower lane · `Esc` pause · `R` restart (after game over or from pause) ·
  mouse for menus. `M` mutes.

## 2. Rules

* Three road lanes (0 = far/upper, 2 = near/lower). The moto rides forward by itself; the world scrolls left.
  Lane changes take 0.16 s.
* Speed rises with distance (≈32 → 75 km/h). Every 600 m you reach a new avenue (banner): Av. Abraham Lincoln →
  Av. 27 de Febrero → Av. John F. Kennedy → Av. Duarte → Av. Máximo Gómez → Av. Winston Churchill → (loop,
  “Hora pico +1”). Each stage adds traffic and events.
* **3 cascos**: a crash costs one casco, 1.6 s of invulnerability and half your speed for a moment. Losing the
  third ends the run. A rare *casco* pickup gives one back (max 3).
* Potholes (*hoyos*) don't cost a casco: they shake you, cut your speed and break your combo.
* **Score** = metres + bonuses × combo multiplier (×1 … ×5; +0.5 per bonus within 4 s, reset by crashes/hoyos):
  * *Rebase* (overtaking a vehicle in an adjacent lane): +5
  * *¡Por un pelo!* (leaving a vehicle's lane within 1.2 m of it): +50
  * *¡Por el medio!* (passing between vehicles in both neighbouring lanes): +75
  * Plantain dodged: +10 · Passenger picked up: +100 · Ride completed (300–500 m later): +300
* Scoring rules and limits live in `packages/shared/src/tapon.ts`, shared by the game and the server (§6).

## 3. Vehicles (original side-view illustrations, facing right)

Scale: **75 px = 1 m** at the near lane (the middle and far lanes are drawn at 0.92 / 0.84). Every sprite is a
separate SVG generated in code in `packages/tapon/src/art/` — no photos, no copied artwork, no real brands or
insignia. `npx tsx packages/tapon/scripts/export-assets.ts` writes them to
`apps/web/public/games/el-tapon/sprites/` (one SVG per sprite + `sprites.json` with size, ground line, collision
box, wheels and anchors), transparent WebP composites for the catalog page to `…/el-tapon/vehicles/`, and the
dimension/collision table to [`EL_TAPON_ASSETS.md`](EL_TAPON_ASSETS.md). Wheels are separate sprites so they
turn; bodies bob on their suspension; motorcycle riders are overlays.

| # | Vehicle | Behaviour |
| --- | --- | --- |
| 1 | **Motoconchista** (player): 150 cc bike, rider in helmet and numbered vest; three passenger variants | Lane changes 0.16 s |
| 2 | **Carro público** (worn 90s sedan, primer-blue door, rust, route painted on the door, five passengers) | Changes lane unexpectedly (blinks 0.7 s first) |
| 3 | **Sonata mamey** (mamey-orange taxi inspired by the classic Sonata taxis, roof sign, no brand marks) | Fastest car, cuts into lanes |
| 4 | **OMSA** (long green city bus, LED destination, plain text, passengers) | Very long and slow; stops in its corridor |
| 5 | **Guagua** “La Bendición” (painted minibus, roof luggage, *cobrador* hanging from the door) | Sudden stops in curb lanes (“¡Vamo, vamo!”, brake lights) |
| 6 | **La Platanera** (small truck overloaded with green plantains, ropes, cardboard price sign) | Drops plantains behind it: obstacles with their own sprites, collision boxes and slide-whistle sound, +10 when dodged |
| 7 | **Patrulla** (white pickup, blue/yellow check band, light bar, officers in the bed; no insignia) | Siren from behind (arrow warning) or a *chequeo* with cones that closes a lane |
| 8 | **Tránsito (AMET / DIGESETT)**: officer (¡Pare! / siga), patrol motorcycle, pickup (no insignia) | Lane closures with cones + *DESVÍO*, officer stopping a lane, patrol moto in traffic |
| 9 | Everyday traffic: private sedan (silver, wine, white), yipeta (black, white), delivery moto, water truck with *botellones*, garbage truck with crew, moving truck loaded to the sky, coconut pickup | Sedans/yipetas change lanes (yipetas without much warning), delivery motos zigzag, water and garbage trucks stop (“¡Agua!”, “¡La basura!”), moving truck crawls |

The game and its catalog page carry the notice: El Tapón is humour and fiction, *inspired by* Santo Domingo
traffic, and is not affiliated with or endorsed by the Policía Nacional, DIGESETT (formerly AMET), OMSA or any
vehicle brand.

## 4. Fairness (never an unavoidable crash)

Before anything changes the road — a new vehicle, a lane change, a sudden stop, a dropped plantain, a closure,
an officer waving traffic on — the world asks `hasEscape()` (`sim/fairness.ts`): it predicts the next **8 s**
(0.05 s steps, the same car-following rule as the world, the moto's real acceleration and 0.16 s lane changes),
gives the player **0.45 s** to react and searches lane states for a collision-free path with a 0.5 m margin
(players get 0.25 m). The change only happens if a way out remains; otherwise it is skipped or postponed. Every
step the world also checks itself and, if prediction drift ever closed the way, removes an off-screen car that
reopens it. Warnings precede events: blinkers (0.7 s), brake lights, siren arrow, closure sign and whistle.

Tests (`packages/tapon/test/fairness.test.ts`): a bot that only uses the model's information drives 12 seeded runs
of 150 s with **0 crashes** while the world refuses changes many times; scores always stay inside the bounds
the server accepts. A wider sweep (100 seeds × 60 s) is part of QA. The player's own choices can still lead into
a dead end — that is the game.

## 5. Santo Domingo street

Parallax layers: sky with time of day (starts at 17:00, sunset, night after ≈3 km) · distant towers · street
front of 2–4-storey buildings in Caribbean colours with balconies and *rejas*, roll-up shutters, colmados,
bancas, pica pollo, ferretería, salón, farmacia, painted signs (all invented names), black water tanks,
AC units and satellite dishes · poles with tangled cables and transformers · almond trees and palms · bus stops
with people · sidewalks with painted curbs · asphalt with patches, potholes and manholes · foreground poles,
fruit vendor and pedestrians.

## 6. Integration with DominicanGames

* **Catalog**: row `el-tapon` (published, `guest_play = true`, cover/hero/9 screenshots in
  `apps/web/public/img/games/el-tapon/`), added by migration `0002_el_tapon` (automatic JSON backup before
  migrating; rollback `npm run db:rollback -- 0002_el_tapon`, newest migration first). Admins can switch guest
  play off from Admin → Juegos.
* **Web**: `/juegos/el-tapon/jugar` is a public full-screen route (no account needed): 16:9 stage scaled to the
  window, notice below 1280×720, touch-only devices get a “play on PC” page. React overlays (designed at
  1920×1080) for the menu (records, controls, guest notice), pause (volumes) and game over (stats, saving).
  `/juegos/el-tapon` adds how-to-play, the vehicle gallery, the record tables and the FAQ.
* **Runs** (`arcade_runs`): the browser registers a run before it starts — `POST /api/arcade/el-tapon/runs`
  returns `{ runId, secret, seed }`; the game uses that seed and records every lane change against the
  simulation step. At game over `POST …/runs/:id/finish` sends score, stats and the input log. The server checks
  the secret (only its SHA-256 is stored), that the run belongs to the caller, that it did not last longer than the
  time since it was registered, and the plausibility rules of `taponImplausible()` (score inside the bounds of the
  stats, speed limit, crashes vs cascos, event rates…).
* **Server replay**: the simulation is deterministic (seeded RNG and only exactly-specified arithmetic — `expNeg`
  replaces `Math.exp`), so the server re-runs runs that would enter one of the tables (top 100, all-time or week)
  or unlock an achievement, in small chunks so the API keeps answering (`games/el-tapon/verify.ts`). Only
  `verified` runs appear in tables and achievements; others are `saved` (history), `pending` or `rejected`. A
  `SIM_VERSION` bump makes old clients reload. Runs that were never finished are deleted after a day; IPs are
  stored only as a keyed hash for rate limits.
* **Guests** save with a nickname (3–16 characters, word filter, can't be an existing username or look like
  staff); the best run per nickname is shown with an “invitado” tag. **Accounts** save automatically, appear with
  their username (respecting “Mostrar en rankings”), get play sessions, dashboard progress (records, avenues
  reached) and 8 achievements (Primer tapón, Un kilómetro de tapón, Rey del tapón, Cinco mil, Motoconchista de
  confianza, Esquiva-plátanos, Por un pelo, En racha).
* **Tables**: `GET /api/arcade/el-tapon/leaderboard?period=all|week` (best verified run per player, cached 5 s) and
  the community page board “El Tapón — Récords”. **Moderation**: Admin → Puntuaciones lists recent runs and can
  hide any entry (audited).

## 7. Implementation status

Done: everything above — engine, 7 signature vehicles + everyday traffic, fair events, street, audio, menus,
server API with replay verification, catalog entry and images, achievements, community board, admin moderation,
asset export, tests (unit: fairness, scoring bounds, server API, migration up/down; e2e: guest run saved with a
nickname, game page, small-window notice).

Ideas for later: weekly challenges with fixed seeds, more avenues/landmarks in the skyline, an ambulance and
*motoconchos* with passengers in traffic, gamepad support.
