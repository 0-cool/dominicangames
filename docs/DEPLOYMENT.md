# Deployment

## Environments

| Env | `NODE_ENV` | Payments | Email | Notes |
|---|---|---|---|---|
| development | development | off (sandbox kept for legacy tests) | dev mailbox (`DEV_MAILBOX=true`) | Vite dev server + API with `tsx watch` |
| staging | production | off | real SMTP | same build as production |
| production | production | **off** (`MONETIZATION_ENABLED=false`) — no provider needed | real SMTP | dev mailbox refused by config validation; the sandbox payment page never exists in production |

## Requirements

* Node.js ≥ 20.19 (22 LTS recommended), PostgreSQL 16+, an SMTP account, HTTPS termination (reverse proxy or platform).
* About 60 MB of disk for world data (`apps/server/game-data/world`).

## Build

```bash
npm ci
npm run world:build          # regenerates apps/server/game-data/world from data/osm (≈30 s)
npm run build                # web → apps/web/dist, server → apps/server/dist/index.js
```

## Configure

Copy `.env.example` to `.env` (or set the variables in your platform) and fill at least:

```
NODE_ENV=production
DATABASE_URL=postgres://…
APP_ORIGIN=https://tu-dominio.do
TRUST_PROXY=true                 # when behind a reverse proxy / load balancer
CSRF_SECRET=<64 random hex>
SMTP_URL=smtps://user:pass@smtp.example.com:465
MAIL_FROM="DominicanGames <no-reply@tu-dominio.do>"
MONETIZATION_ENABLED=false       # DominicanGames is free (see MONETIZATION.md)
GAME_DATA_DIR=/srv/sd/game-data
WEB_DIST_DIR=/srv/sd/web
DB_BACKUP_BEFORE_MIGRATE=true    # JSON backup of every table before pending migrations
BACKUP_DIR=/srv/sd/backups       # keep it outside the web root; it contains personal data
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Run

```bash
npm run db:migrate               # or keep MIGRATE_ON_START (default true)
NODE_ENV=production node apps/server/dist/index.js
npm run admin:create -- admin@tu-dominio.do 'una-clave-larga-y-unica' admin
```

The API serves the SPA from `WEB_DIST_DIR` (history fallback with **per-route SEO head tags**, `robots.txt` and
`sitemap.xml` generated from the catalog — set `APP_ORIGIN` to the public https origin) and the world data from
`GAME_DATA_DIR`. Put a CDN in front of `/assets/*` and `/img/*` (immutable hashed files / images). Do **not** cache
`/api/*` or HTML at the CDN — world data responses are `private` because they require a session, and HTML carries
route-specific tags.

## Reverse proxy (example: Caddy)

```
tu-dominio.do {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4000
}
```

## Operations

* **Health**: `GET /api/health`.
* **Logs**: JSON (pino) on stdout; ship to your log platform. Business events are in `audit_logs`; server/client errors in `error_logs` (visible in Admin → Errores).
* **Backups**: daily `pg_dump` with point-in-time recovery if available; payments must be retained per fiscal rules.
  The app also writes a JSON dump before applying migrations (`npm run db:backup` on demand).
* **Scaling**: the API is stateless except for in-memory rate limits — use the Redis store before running several instances.
* **Rollbacks**: migrations are SQL files in `apps/server/drizzle/` with hand-written down scripts in
  `drizzle/rollback/`. Roll back with `npm run db:rollback -- <tag>` (backup first, single transaction), deploy the
  previous build, and start it with `MIGRATE_ON_START=false`.
