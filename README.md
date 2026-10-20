# Naga City Livestock Monitoring System (with GIS Integration)

A mobile-friendly, installable PWA for the City Veterinary Office: livestock owner & farm registry, monthly population
monitoring, ear-tag registry and ownership transfers, stray incidents, farm geotagging, GIS and outbreak maps,
radius analysis, disease surveillance (incidents → lab → response), vaccinations, analytics and 27 exportable reports.

Built to match the Figma prototype screen-for-screen, with the seed data reproducing the prototype's figures
(20 owners · 28 farms · 3,473 head · 9 cases · radius of CASE-0001 = 6 farms / 988 head).

## Stack

| Layer      | Choice                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Frontend   | React 18 + Vite + TypeScript, PWA via `vite-plugin-pwa` (Workbox)                               |
| UI         | Tailwind CSS + shadcn/ui-style components (Radix), Recharts, Leaflet / react-leaflet            |
| Data       | TanStack Query (server state), Dexie (IndexedDB outbox for offline writes)                      |
| Backend    | Node.js + Express + TypeScript, Zod validation (schemas shared with the PWA)                    |
| Auth       | JWT access token + rotating refresh token in httpOnly cookies; roles: admin, staff, read-only   |
| Database   | MySQL 8 + Prisma ORM 7 (MariaDB driver adapter) + Prisma Migrate                                |
| Files      | Local volume in development; S3-compatible (MinIO / AWS S3 / Cloudflare R2) in production       |
| Testing    | Vitest (shared, API integration, web) + Playwright (25 end-to-end tests incl. mobile & offline) |
| Quality    | ESLint, Prettier, TypeScript strict                                                             |
| Deployment | Docker Compose: API, Caddy (static PWA + automatic HTTPS), MySQL, MinIO                         |
| CI/CD      | GitHub Actions: lint → typecheck → tests → build images (GHCR) → SSH deploy                     |
| Monitoring | Sentry (frontend & backend, optional), `/health` endpoint                                       |

## Repository layout

```
apps/
  api/        Express API — prisma/ (schema, migrations, seed), src/routes, src/services (metrics, reports)
  web/        React PWA — src/pages, src/components, src/dialogs, src/lib (api, offline, export)
packages/
  shared/     Zod schemas, constants, formatting & geo helpers used by both apps
e2e/          Playwright end-to-end tests
deploy/       Caddyfile, MySQL init script
```

## Quick start (development)

Requirements: Node 20+ (22 recommended), pnpm 10 (`corepack enable`), MySQL 8 (or Docker).

```bash
pnpm install

# 1) Database & object storage (or use your own MySQL 8)
docker compose -f docker-compose.dev.yml up -d

# 2) API environment
cp apps/api/.env.example apps/api/.env      # defaults match docker-compose.dev.yml

# 3) Create tables and load the prototype data
pnpm db:migrate        # prisma migrate dev
pnpm db:seed           # wipes and reseeds

# 4) Run API (:4000) and PWA (:5173) together
pnpm dev
```

Open http://localhost:5173 and sign in:

| Role      | Email                       | Password         |
| --------- | --------------------------- | ---------------- |
| Admin     | `admin@nagacityvet.gov.ph`  | `Livestock@2026` |
| Staff     | `mark@nagacityvet.gov.ph`   | `Livestock@2026` |
| Staff     | `joy@nagacityvet.gov.ph`    | `Livestock@2026` |
| Read-only | `viewer@nagacityvet.gov.ph` | `Livestock@2026` |

Change these passwords (User Management) before going live.

## Roles

- **Admin** — everything, including User Management and System Settings.
- **Staff** — create and edit records, run reports and exports.
- **Read-only** — view, search and export; every write is rejected by the API (403) and hidden in the UI.

## Offline use

- The app shell, map tiles you've viewed, and recent API responses are cached by the service worker, so pages keep
  working without a connection.
- Writes made offline (registrations, population updates, cases, vaccinations, geotags, photos…) are stored in an
  IndexedDB outbox and replayed in order when the device reconnects (and every 30 s). The header shows
  “Offline · N queued” / “N pending sync”. Server-side validation errors are kept on the item for review.
- When an update is deployed, users get a “New version available — Reload” prompt.

## Tests

```bash
pnpm test         # Vitest: shared + web unit tests, API integration tests (uses livestock_test, reseeded)
pnpm test:e2e     # Playwright: starts API :4100 + PWA :5174 against livestock_test, migrates & seeds it
pnpm lint && pnpm typecheck && pnpm format:check
```

The test database URL can be overridden with `TEST_DATABASE_URL` / `E2E_DATABASE_URL`.
`docker-compose.dev.yml` creates `livestock_test` automatically.

## Production deployment (single VPS — Hetzner / DigitalOcean)

1. Point your domain's DNS A record to the server; install Docker.
2. Clone the repo to `/opt/naga-livestock`, then:
   ```bash
   cp .env.example .env    # set DOMAIN, passwords, JWT secrets (openssl rand -hex 32), S3 secret
   docker compose up -d --build
   docker compose exec api node dist/prisma/seed.js   # optional: load demo data (wipes data!)
   ```
3. Caddy obtains HTTPS certificates automatically. The API runs `prisma migrate deploy` on every start.
4. Uploads go to the bundled MinIO bucket (private; files are streamed through the API with auth).
   For AWS S3 or Cloudflare R2, change the `S3_*` variables and remove the `minio` services.

Back up the `mysql_data` and `minio_data` volumes (e.g. nightly `mysqldump` + `mc mirror`).

### CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs lint, typecheck, Vitest and Playwright on every push/PR. On `main` it builds the API
and web images, pushes them to GHCR, then deploys over SSH (`docker compose pull && up -d`).

Repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, optional `VPS_APP_DIR` (default `/opt/naga-livestock`),
`VITE_SENTRY_DSN`. Create a `production` environment for approvals if desired.

### Railway / Render instead of a VPS

Deploy `apps/api/Dockerfile` as a web service (set the same env vars; use a managed MySQL 8 and S3/R2), and
`apps/web/Dockerfile` as a second service with `DOMAIN=:80` and the API's private hostname in `deploy/Caddyfile`
(replace `api:4000`).

## Monitoring

- `GET /health` → `{ status: 'ok', db: 'ok' }` (503 if the database is unreachable) — use for uptime checks.
- Set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (PWA build arg) to enable Sentry.

## Notes on the data model

- **Population groups** hold the authoritative head count. Tagged animals are members of a group and are never added
  again; a group's count cannot drop below its tagged animals.
- **Monthly updates** — re-saving a month supersedes the earlier entry (kept for audit). The trend chart shows each
  month as Verified / Adjusted (amended) / Carried forward (no update that month).
- **Farm record status** — Verified this month, Overdue (last updated last month), Outdated (older).
- **Vaccination coverage** — Estimated = first-dose group heads + distinct tagged animals vaccinated, over the
  population; Exact = vaccinated tagged animals over tagged animals. No dosage calculation is performed.
- **Radius analysis** uses haversine distance from the case location; farms without coordinates are excluded and
  counted so they can be geotagged.
- **Ownership transfer** moves the animal to the receiving farm's group of the same species (created if needed) and
  moves one head between the two group counts.

## Prisma 7

Prisma 7's Rust-free client is used with `@prisma/adapter-mariadb` (compatible with MySQL 8), configured in
`apps/api/prisma.config.ts`. The generated client is written to `apps/api/src/generated` (git-ignored) by
`pnpm --filter @livestock/api generate`, which also runs automatically in `dev`, `build` and `typecheck`.
