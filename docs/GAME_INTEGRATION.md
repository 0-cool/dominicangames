# Game integration — connecting a game to DominicanGames Core

DominicanGames is a **modular monolith**: one API process (Fastify) and one web app (React) contain the
platform core and every game module. There is no microservice, queue or extra infrastructure to run.

```
                         ┌──────────────────────── DOMINICANGAMES CORE ────────────────────────┐
 Browser (React SPA)     │ identity · catalog · launch/sessions · achievements · rankings ·     │
  ├─ platform pages ───▶ │ announcements · dashboard · admin · SEO · DG Monetization (off)      │
  └─ game routes  ─────▶ │                                                                     │
        (lazy chunks)    └───────────────▲─────────────────────────────────▲───────────────────┘
                                         │ GameModule (server)              │ WebGameModule (web)
                         ┌───────────────┴──────────────┐   ┌───────────────┴──────────────┐
                         │ games/santo-domingo-open-world│   │ games/registry.tsx            │
                         │  API /api/game/* (assets,     │   │  /jugar (launcher) + /juego   │
                         │  saves, missions, settings),  │   │  (full screen engine, lazy),  │
                         │  achievements, progress,      │   │  extra sections for its page  │
                         │  leaderboards                 │   │                               │
                         └───────────────────────────────┘   └───────────────────────────────┘
```

## What the Core gives every game

| Capability | Where | Notes |
|---|---|---|
| One account (session cookie, CSRF, lockout, verification, reset) | `routes/auth.ts`, `plugins/security.ts` | No game ever has its own login |
| Catalog entry (title, status, images, categories, platforms, launch path, theme) | `games` table, `platform/catalog.ts`, Admin → Juegos | Homepage, catalog, dashboard, sitemap read from it |
| Launch authorization | `requireGameAccess(req, ctx, gameId)` | Signed-in, non-suspended account + playable game. **No payment check.** |
| Guest play (optional) | `games.guest_play` (Admin → Juegos → “Se puede jugar sin cuenta”) | Only for games whose module supports guests (El Tapón); its own API must check the flag on the server |
| Play sessions | `POST /api/platform/sessions` → `/:id/heartbeat` → `/:id/end`; web SDK `platform/session.ts` (`PlaySession`) | “Continuar jugando”, recently played, play time, admin analytics |
| Achievements | `GameModule.achievements` + `evaluateAchievements` → `user_achievements` | Points feed the “Jugadores destacados” ranking |
| Rankings | `GameModule.leaderboards` | Only players with `show_in_rankings = true`; usernames/avatars only |
| Dashboard progress | `GameModule.progress` | Stat tiles, milestones, completion % |
| Per-game data | `player_saves`, `mission_progress`, `game_settings` keyed by `(user_id, game_id)` | A game may also add its own tables (always with `user_id` + FK to `users`) |
| Announcements, SEO, admin | Core | Nothing to do in the game |

## Statuses

| Status | Listed | Playable | Use |
|---|---|---|---|
| `published` | everyone | every signed-in account | Live game (needs a module + `launchPath`) |
| `development` | administrators | administrators | QA a new game in production before release |
| `coming_soon` | everyone (“Próximamente”, concept art) | never | Announced concepts |
| `hidden` | nobody | nobody | Withdrawn / archived (data is kept) |

## Adding a new game (checklist)

1. **Catalog entry** — Admin → Juegos → *Nuevo juego*: id (`kebab-case`, permanent), title, texts, `coming_soon`.
   Real images go in `apps/web/public/img/games/<id>/` (cover 4:5, hero 16:9, screenshots 16:9).
2. **Server module** — create `apps/server/src/games/<id>/index.ts` implementing `GameModule`
   (`platform/modules.ts`): register the game's API (guard **every** handler with `requireGameAccess`), declare
   achievements, implement `evaluateAchievements` and `progress`, optionally `leaderboards`. Add it to
   `apps/server/src/games/index.ts`. New tables → `npm run db:generate -- --name <id>_…` (+ a rollback SQL in
   `drizzle/rollback/`).
3. **Web module** — create `apps/web/src/games/<id>/` and register it in `apps/web/src/games/registry.tsx` with its
   routes (e.g. `/juegos/<id>/jugar`), lazy-loaded so the platform stays light. Use `PlaySession` from
   `platform/session.ts` when the player starts and leaves. Offer a “Volver a DominicanGames” action (→ `/panel`).
4. **Test** — set the entry to `development` and `launchPath` to the new route; play it as an admin.
5. **Publish** — Admin → Juegos → *Publicar*. Optionally post an announcement (Admin → Anuncios).

## Santo Domingo Open World (reference implementation)

| Piece | File |
|---|---|
| Server module (API `/api/game/*`, achievements, progress, leaderboards) | `apps/server/src/games/santo-domingo-open-world/` |
| Web module (routes `/jugar`, `/juego`; page sections) | `apps/web/src/games/registry.tsx`, `apps/web/src/games/santo-domingo-open-world/` |
| Engine host (sessions, return to platform, autosave) | `apps/web/src/game/GameScreen.tsx`, `game/hud/PauseMenu.tsx` |
| Engine (unchanged by the platform integration) | `packages/game` |

The existing game routes and API paths were kept on purpose, so the engine, its saves and its tests did not need
to change.

## El Tapón (arcade with guest play)

| Piece | File |
|---|---|
| Server module (runs, finish with plausibility checks + server replay, leaderboards, moderation, achievements, progress) | `apps/server/src/games/el-tapon/` |
| Shared contract (stats, scoring bounds, nickname rules, API types) | `packages/shared/src/tapon.ts` |
| Web module (public route `/juegos/el-tapon/jugar`, page sections) | `apps/web/src/games/el-tapon/` |
| Engine (simulation, fairness, replay, art, renderer, audio) | `packages/tapon` |

Arcade runs use their own table (`arcade_runs`) instead of saves: a run is registered (seed + secret), played,
then finished once. See [EL_TAPON.md](EL_TAPON.md) §6.
