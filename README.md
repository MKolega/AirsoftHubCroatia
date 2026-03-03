# AirsoftHubCroatia

Link: https://airsofthubcroatia.eu

## Purpose

The purpose of this site is to provide a single place where airsoft players in Croatia can discover and keep track of events happening near them. 
I built it because there wasn’t a clear, up-to-date platform that aggregated local events in one spot. 
Users can save events they’re interested in and submit new events that aren’t currently listed.

---

## Tech stack

- **Backend:** Go + Gin (REST API under `/api/*`)
- **Frontend:** React + TypeScript + Vite
- **Database:** PostgreSQL
- **Reverse proxy / TLS:** Caddy (serves the SPA + proxies `/api/*`)
- **Infra:** Docker + Docker Compose (production stack)
- **CI/CD:** GitHub Actions (CI on PRs, deploy on push to `main`)

## How it fits together

In production, everything runs via `docker-compose.prod.yml`:

- `web` (Caddy)
  - terminates HTTPS (Let’s Encrypt)
  - serves the built frontend
  - reverse-proxies `/api/*` to the API container
- `api` (Go)
  - serves the API under `/api/*`
  - reads configuration from `.env`
  - connects to Postgres on the internal Docker network
- `postgres`
  - stores application data in a named Docker volume

The public routing is:

- `https://<domain>/` → frontend
- `https://<domain>/api/*` → backend

## Repo structure

- `cmd/api/` – Go API entrypoint
- `handlers/` – HTTP handlers and middleware (auth, maintenance gate, rate limiting)
- `internal/db/` – DB connection + schema initialization + queries
- `internal/storage/` – Cloudflare R2 integration
- `types/` – shared Go types
- `frontend/` – React app (Vite)
- `deploy/` – production helper scripts + Caddy config

## Local development

### 1) Start Postgres

```bash
docker compose up -d postgres
```

### 2) Configure the API

```bash
cp env.example .env
# edit .env
```

### 3) Run the API

```bash
go run ./cmd/api
```

### 4) Run the frontend

```bash
npm ci
npm --workspace frontend run dev
```

Vite proxies API requests to the Go server:

- `/api/*` → `http://localhost:8080`
- `/uploads/*` → `http://localhost:8080`

## Production

Quick start:

```bash
cp env.example .env
# edit .env

docker compose -f docker-compose.prod.yml up -d --build
# or
bash deploy/deploy.sh
```

Maintenance toggle:

```bash
bash deploy/maintenance.sh on
bash deploy/maintenance.sh off
bash deploy/maintenance.sh status
```

## CI/CD

- **CI** runs on Pull Requests to `main`:
  - Go tests
  - frontend lint + build
  - docker build check
- **Deploy** runs on push to `main`:
  - SSHes into the VPS
  - resets repo to `origin/main`
  - runs `deploy/deploy.sh`

## Configuration

- Local and production config is read from environment variables.
- `.env` is intentionally **not committed**. Use `env.example` as a template.

Key variables:

- `AUTH_JWT_SECRET` (required)
- `DATABASE_URL`
- `DOMAIN` (for Caddy/HTTPS)
- `MAINTENANCE_MODE`
- `ADMIN_EMAILS`
- `MAINTENANCE_USER_EMAILS` (can access during maintenance, regular-user permissions)
- R2 variables: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`

## Contributing

See `CONTRIBUTING.md` for the GitHub Flow workflow (feature branches → PR → merge to `main` → deploy).
