# QA checklist and acceptance criteria

Automated evidence: `npm test` (API integration, PostgreSQL), `npx playwright test` (site + full journey),
`npm run typecheck`. Manual items must be repeated on real hardware before launch.

## DominicanGames platform — acceptance criteria (23 Nov 2026)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| P1 | **Critical:** a new account launches Santo Domingo Open World without payment information or any payment | ✅ | e2e `journey.spec.ts` (never visits `/pago`/`/sandbox-pay`, never calls checkout); API test “a brand-new account plays … without paying” |
| P2 | Registration, login, logout are free and never interrupted by a payment screen | ✅ | e2e journey (register → `/jugar`; logout → login → `/panel`); API auth tests |
| P3 | No payment verification to play; checkout disabled | ✅ | API: assets/save/missions for unpaid + unverified account; `POST /api/payments/checkout` → 410 |
| P4 | Payment infrastructure preserved (signed webhooks, idempotency, amount checks, refunds) | ✅ | API “DG Monetization — payment engine preserved” suite (monetization enabled in-test with a test product) |
| P5 | Legacy RD$100 buyers keep everything (+ Fundador badge; refund removes the badge only) | ✅ | API legacy purchase test; migration test keeps payments |
| P6 | Homepage: hero, featured game with real launch, upcoming concepts (not playable), why, community, no fake stats | ✅ | e2e `site.spec.ts` homepage test; visual review |
| P7 | Catalog data model, admin-managed (add, edit, publish, upcoming, hide, featured) — backend-authorized | ✅ | API catalog tests (403 for players, validation, audit) |
| P8 | One identity for all games (username, avatar, rankings visibility, locale) | ✅ | API profile test; e2e journey |
| P9 | Dashboard with CONTINUAR JUGANDO (last played, else featured), recently played, progress, achievements | ✅ | API dashboard test; e2e journey (featured → recent) |
| P10 | Return-to-platform from the game, saves linked to the account | ✅ | e2e journey (pause → “Volver a DominicanGames” → `/panel`) |
| P11 | Protected routes and backend authorization | ✅ | e2e redirects (`/jugar`, `/juego`, `/panel`, `/admin`); API 401/403 tests |
| P12 | Database migration is reversible and preserves saves, with backups | ✅ | `apps/server/test/migration.test.ts` (up → down → up with a legacy save + payment); CLI run of `db:migrate` / `db:rollback` |
| P13 | SEO: titles, descriptions, OG, canonical, JSON-LD, robots, sitemap | ✅ | API SEO test; e2e robots/sitemap; production bundle served with injected head (manual check) |
| P14 | Existing game functionality unchanged | ✅ | e2e journey: walk, sprint, collisions, jump, car, motorcycle, pause, save, map, Mission 001 |
| P15 | Desktop layouts (1280–1920 px) | ✅ | Visual review at 1440×900 and 1280×720; mobile intentionally out of scope for this phase |

## El Tapón — acceptance criteria (23 Nov 2026)

| # | Criterion (design brief) | Status | Evidence |
|---|---|---|---|
| T1 | Works in a PC browser, 16:9, scales with the window, minimum 1280×720, no mobile gameplay | ✅ | e2e `tapon.spec.ts` (small-window notice); visual review at 1920×1080, 1600×900, 1440×900, 1280×720; touch-only devices get a “play on PC” page |
| T2 | Keyboard: W/↑, S/↓, Esc pause, R restart when allowed; mouse menus | ✅ | e2e (Esc pause/resume); `Game.ts` key handling; menus are buttons |
| T3 | The 7 signature vehicles are individually illustrated, original, transparent, same camera/scale, with documented size and collision bounds | ✅ | `packages/tapon/src/art/`, `apps/web/public/games/el-tapon/sprites/*.svg` + `sprites.json`, `docs/EL_TAPON_ASSETS.md` |
| T4 | Different behaviours (concho lane changes, guagua stops, OMSA, platanera drops, police siren/chequeo, transit closures/officer) | ✅ | `sim/kinds.ts`, `sim/world.ts`; screenshots in the catalog |
| T5 | Plantains are avoidable obstacles with their own sprites, collision and sound | ✅ | `platano`/`platano-racimo` sprites, fairness-checked drops, slide-whistle cue, +10 when dodged |
| T6 | Fair gameplay: no unavoidable collision created by the game | ✅ | `fairness.test.ts` (12 × 150 s, 0 crashes), 100-seed × 60 s sweep: 0 crashes |
| T7 | Recognisable Santo Domingo street (colmados, balconies with rejas, cables, signs, bus stops, sidewalks, trees, traffic) | ✅ | `art/street.ts`, `render/street.ts`; visual review |
| T8 | Integrated with DominicanGames (catalog, page, dashboard, achievements, community, admin) | ✅ | API `tapon.test.ts`; e2e game page; dashboard/community/admin visual review |
| T9 | Guest play and high scores preserved (guests with a nickname, accounts automatically) | ✅ | e2e guest run saved and shown in the table; API tests (guest + account) |
| T10 | No official endorsement implied, no protected insignia, no Hyundai branding | ✅ | Disclaimers on the menu, game page FAQ and Créditos; sprites use plain text only |
| T11 | Additional everyday vehicles | ✅ | sedans (3 colours), yipetas (2), delivery moto, water truck, garbage truck, moving truck, coconut pickup |

## Original acceptance criteria (game) — still valid

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Website is functional | ✅ | e2e `site.spec.ts`; all pages routed in `apps/web/src/router.tsx` |
| 2 | Users can register | ✅ | e2e journey; API test “registers for free…” |
| 3 | Users can log in | ✅ | API test “logs in and out…”, e2e journey |
| 4 | Email verification works | ✅ (dev mailbox) | API test; production needs `SMTP_URL`. Verification is optional for playing |
| 5–9 | RD$100 payment flow / unpaid users blocked | ⛔ Retired | Replaced by P1–P5 (free platform) |
| 10 | The game loads in a browser | ✅ | e2e journey reaches the HUD (Chromium + SwiftShader) |
| 11 | Player can walk, run and jump | ✅ | e2e journey |
| 12 | Player can enter and exit vehicles | ✅ | e2e journey |
| 13 | At least one motorcycle and one car are usable | ✅ | e2e journey |
| 14 | City geography is recognisably Santo Domingo | ✅ | OSM street network, 236 named streets, 15 landmarks |
| 15–18 | Roads connected, building collision, NPCs, traffic | ✅ | world-builder validation, e2e journey |
| 19 | The introductory mission can be completed | ✅ | e2e journey; dashboard shows it completed |
| 20 | The game saves progress | ✅ | e2e journey + API tests (per-game saves) |
| 21–22 | Graphics settings, pause menu | ✅ | e2e journey |
| 23 | Browser tests pass | ✅ | see results below |
| 24 | No critical security vulnerability is known | ✅ | see SECURITY.md |
| 25 | Production documentation exists | ✅ | `docs/*`, `README.md` |

## Latest automated results (23 Nov 2026, with El Tapón)

* `npm run typecheck` — all 6 workspaces pass.
* Unit/integration tests — **83/83**: API 49 (incl. El Tapón 6 + migration up/down with 0001 and 0002), shared 11, engine 10, world-builder 7, El Tapón 6 (fairness, scoring bounds, replay determinism).
* `npx playwright test` — **15/15**: site/API/SEO 11, full Santo Domingo Open World journey, El Tapón 3 (game page, a guest plays a real run and saves it with a nickname — verified by the server replay —, small-window notice).
* Production build: the server bundle includes the El Tapón simulation and serves `/juegos/el-tapon/jugar` with its own head tags.

## Results after the DominicanGames integration (23 Nov 2026)

* `npm run typecheck` — all 5 workspaces pass.
* `npm test` — **62/62** pass: API integration 29 + migration 1 + configuration 9 (PostgreSQL 16), shared schemas + platform contracts 11, engine 5, world-builder 7. *(Baseline before the change: 42/42.)*
* `npx playwright test` against the development stack — **12/12** pass: 11 site/API/SEO tests + the full free journey (≈2 min under SwiftShader).
* Production bundle (`npm run build`, served by the API with the strict CSP): every public page loads with **0 console errors / CSP violations**; per-route head tags, `robots.txt` and `sitemap.xml` verified.
* Visual QA at 1440×900: homepage, catalog, game pages (available + concept), community, auth, dashboard (new + returning player), profile, admin (overview, catalog, editor, announcements), launcher, game loading screen, HUD, pause menu.

## Defects found and fixed during the DominicanGames integration

| Area | Symptom | Root cause | Fix |
|---|---|---|---|
| Admin API | Editing one field of a game (e.g. status) reset every other field (texts, images, launch path) | Zod 4 applies `.default()` values inside `.partial()` | Separate schemas: create (with defaults) and update (no defaults); unit test |
| Admin metrics | Games never launched showed “12 h” of play time | `LEAST()` ignores `NULL` in the LEFT JOIN | `coalesce(…, 0)` before `LEAST`; regression test |
| Server bundle | The bundled server ran the migration CLI block at boot (twice, even with `MIGRATE_ON_START=false`) and the CLI check never matched on Windows | Entry-point check compared `import.meta.url`, shared by every inlined module, with a non-normalised path | `isEntryPoint(metaUrl, name)` (path-normalised, Windows-safe, bundle-safe) |
| Catalog cards | Concept art only filled the top of the card | Cover wrapper forced `relative` over the caller's `absolute` | Positioning decided by the caller |

## Defects found and fixed during QA (original delivery)

| Area | Symptom | Root cause | Fix |
|---|---|---|---|
| Rendering | Whole frame turned black when looking at the sun over the sea | GGX highlight on the calm sea exceeded the half-float range → Inf → NaN in the bloom blur | Clamp of the linear output of every lit material (`Renderer.ts`) |
| Rendering | “TV static” noise inside windows and shopfronts | Per-wall seed attribute was interpolated; hashing it amplified interpolation error per pixel | `flat` varyings for façade attributes |
| Rendering | Shimmering window details at grazing angles | Derivatives (`fwidth`) evaluated inside non-uniform branches; details finer than a pixel | Explicit-width AA helpers + screen-space detail fade |
| Rendering | White-out at night near wall lamps / lit shopfronts | Lamp glow billboards filled the screen near the camera; emissive shopfronts too bright for night exposure | Distance fade for glows, lower emission, night exposure/bloom retuned |
| Engine | Lightning-like flash and time running backwards right after loading | First `requestAnimationFrame` timestamp can precede the loop start → negative `dt` | Clamp `dt ≥ 0` in the loop and in the atmosphere |
| Engine | Reflections stayed in daylight when time/weather changed while paused | Environment map refresh only advanced with `dt` | Refresh also while paused when the lighting key changes |
| Engine | FOV setting had no effect | Camera rig kept interpolating to a fixed 70° | Rig uses the configured FOV |
| World | Mission text said “colmado” but no colmado near the start | Nearest shop to the spawn was a random kind | Builder turns it into “Colmado Don Ramón” (fictional) |
| Server | Bundled server could not find SQL migrations | Path computed relative to the source file | Resolves both source and bundle layouts |
| Server | Tests hit per-IP limits | All test traffic comes from one IP | `RATE_LIMIT_SCALE` (1 in production) + a dedicated rate-limit test |

## Manual test plan (real hardware)

1. Three reference PCs: Intel iGPU laptop (LOW), mid-range desktop (HIGH), high-end (ULTRA). Record FPS in Gazcue, Zona Colonial and Malecón at day/night/rain.
2. Ride Mission 001 end to end with mouse and keyboard; check every checkpoint, the GPS route and the reward screen.
3. Drive each vehicle model; crash a motorcycle at speed; fall into the sea from the Malecón (respawn).
4. Night: walk El Conde and Parque Colón with the camera close to wall lamps (no glare).
5. Rain at sunset over the Malecón (no black frames).
6. Pause/resume with Esc repeatedly, switch tabs, resize the window, toggle each graphics option.
7. Free journey: create an account, play without verifying the e-mail, return with “Volver a DominicanGames”, check “Continuar jugando”; verify the e-mail later from the dev mailbox / SMTP.
8. Accessibility: keyboard navigation through all site forms; screen-reader labels on inputs and menus.
9. Browsers: Chrome, Edge, Firefox (latest) on Windows; Safari 17+ on macOS.

## Known issues / limitations (not bugs to hide)

* Frame rate was not measured on real GPUs in this environment (software rasteriser only).
* DG Monetization is off; AZUL/CardNET live payments are not active (see MONETIZATION.md / PAYMENTS.md).
* Santo Domingo Open World rankings and achievements trust browser-reported saves (no anti-cheat yet). El Tapón
  replays the runs that matter on the server, but a bot that plays well in real time cannot be told apart from a
  person; administrators can hide entries.
* Mission text/dialogue is Spanish only; English UI strings are prepared.
* No mobile/touch controls; the platform UI was designed and reviewed for desktop only in this phase.
* Landmark models are simplified; procedural infill buildings are generic.
* The game is not bug-free; collect reports through Soporte and Admin → Errores.
