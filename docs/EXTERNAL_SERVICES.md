# External services and credentials

Nothing below is hard-coded: every credential is an environment variable (see `.env.example`). The repository
ships **without** any real credential.

| Service | Needed for | Variables | Status | How to obtain |
|---|---|---|---|---|
| PostgreSQL 16+ | All persistent data | `DATABASE_URL` | Required | Managed Postgres (Neon, Supabase, RDS, DigitalOcean…) or self-hosted |
| SMTP provider | Verification, password reset | `SMTP_URL`, `MAIL_FROM` | Required in production | Amazon SES, Postmark, SendGrid, Mailgun… Configure SPF, DKIM and DMARC for the sending domain |
| AZUL (Servicios Digitales Popular) | **Not needed** — only for future optional products (DG Monetization, off) or refunds of legacy purchases | `AZUL_*` | Adapter partial — needs Página de Pago spec + certification | Merchant agreement with AZUL |
| CardNET | Not needed (future optional products) | — | Placeholder | Merchant agreement + “Botón de Pago” documentation |
| Advertising / sponsorship providers | Not integrated (DG Monetization) | — | Off | Requires policy + legal review first |
| Hosting (Node 22) | API + SPA | `HOST`, `PORT`, `TRUST_PROXY`, `APP_ORIGIN` | Required | Any Node host or container platform with HTTPS |
| CDN / object storage | Optional: static assets | — | Optional | Cloudflare, CloudFront, Bunny… (do not cache `/api/*`) |
| Domain + TLS certificate | HTTPS, cookies `Secure` | — | Required | Registrar + Let’s Encrypt / platform TLS |
| Secrets | CSRF tokens (and sandbox webhook signatures in development) | `CSRF_SECRET`, `SANDBOX_WEBHOOK_SECRET` | `CSRF_SECRET` required | Generate 32 random bytes each; rotate on compromise |
| DGII e-CF provider | Fiscal invoices (NCF/e-CF), if required | — | Not included | Authorised electronic invoicing provider |

## Data sources

| Source | Licence | Usage |
|---|---|---|
| OpenStreetMap extract (bbox −69.907, 18.459, −69.875, 18.481) | ODbL 1.0 — attribution “© OpenStreetMap contributors” | Streets, buildings, parks, coastline, landmarks. Attribution shown on the landing page footer, credits page, loading screen, pause menu and map |

The extract was downloaded from the OSM API in November 2026 and is stored compressed in `data/osm/`. To refresh
it, export the same bounding box from openstreetmap.org (or Overpass), replace the file and run `npm run world:build`.
