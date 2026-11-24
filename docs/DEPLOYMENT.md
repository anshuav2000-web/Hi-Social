# Deployment

## Requirements

- Node.js **22.5+** (Node 24 recommended) — `node:sqlite` is required.
- A persistent volume for `data/` (SQLite + generated encryption key) and `storage/uploads/`.
- Outbound HTTPS to `graph.facebook.com` when Meta is configured.

## Option A — Node directly

```bash
npm ci
npm run build
SEED_DEMO=false DATABASE_PATH=/srv/socialhub/data/socialhub.db STORAGE_DIR=/srv/socialhub/uploads \
  APP_ORIGIN=https://social.example.com npm start
```

Run `npm run db:migrate` once before the first start (or let the app bootstrap). Put Nginx/Caddy in front for TLS.

Reverse proxy notes: forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`; allow request bodies up to 25 MB for media uploads.

## Option B — Docker Compose (app + worker)

```bash
cp .env.example .env      # fill META_*, APP_ORIGIN, APP_ENCRYPTION_KEY, WORKER_SECRET
docker compose up -d --build
docker compose logs -f app
```

Two services share the image:

- `app` — Next.js standalone server on :3000, health check `/api/v1/health`.
- `worker` — `node scripts/worker.mjs`, calls `/api/v1/scheduler/tick` with `WORKER_SECRET` every `SCHEDULER_INTERVAL_SECONDS`.

With the worker running, set `ENABLE_INPROCESS_SCHEDULER=false` on `app` (already the compose default) so only one loop claims jobs.
Job claiming is idempotent either way, but a single worker makes the logs readable.

Volumes: `socialhub_data` → `/app/data`, `socialhub_uploads` → `/app/storage/uploads`. Without them, containers lose data on
recreate.

## Option C — Coolify

1. Create a **Docker Compose** resource pointing at this repository (or a Dockerfile resource if you prefer a single container).
2. Add environment variables from `.env.example`; at minimum `APP_ORIGIN`, `APP_ENCRYPTION_KEY`, `WORKER_SECRET`, `SEED_DEMO=false`.
3. Add persistent storage:
   - `/app/data`
   - `/app/storage/uploads`
4. Set the health check to `GET /api/v1/health` (the image already defines it).
5. Set the public domain; Coolify handles TLS. Point `APP_ORIGIN` and `META_REDIRECT_URI` at that domain.
6. Deploy. First boot applies `db/schema.sql` and the RBAC seed.

Coolify caveat: if you scale the app to more than one replica on a shared SQLite file, use a network volume that supports POSIX
locking, or switch to Postgres. One replica is the supported topology.

## Environment reference

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_ORIGIN` | prod | Exact public origin, no trailing slash |
| `APP_ENCRYPTION_KEY` | prod | 32+ random chars; changing it invalidates stored tokens |
| `WORKER_SECRET` | prod | Also required by the worker container |
| `DATABASE_PATH` | no | Defaults to `./data/socialhub.db` |
| `STORAGE_DIR` | no | Defaults to `./storage/uploads` |
| `SEED_DEMO` | no | Set `false` in production |
| `ENABLE_INPROCESS_SCHEDULER` | no | `false` when a worker container runs |
| `META_APP_ID` / `META_APP_SECRET` | for live publishing | Absent → sandbox |
| `META_REDIRECT_URI` | for OAuth | Must match the Meta app setting byte-for-byte |
| `META_GRAPH_VERSION` | no | Default `v23.0` |
| `META_WEBHOOK_VERIFY_TOKEN` | for webhooks | Any random string, also entered in Meta |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | no | e.g. `http://host.docker.internal:11434` |
| `OPENAI_COMPATIBLE_*` | no | Any OpenAI-compatible endpoint |
| `SMTP_URL` / `SMTP_FROM` | no | Enables email notifications |

## Backups

SQLite (WAL) is safe to copy while running **only** with the backup API or after a checkpoint. Safest sequence:

```bash
docker compose exec app node -e "process.getBuiltinModule('node:sqlite')" >/dev/null  # sanity
docker compose stop app worker
docker run --rm -v socialhub_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/socialhub-$(date +%F).tar.gz -C /data .
docker compose start app worker
```

Also archive `storage/uploads` (or the uploads volume). Test a restore into a scratch directory before relying on it.

## Upgrades

1. Back up `data/` and uploads.
2. `docker compose build && docker compose up -d`.
3. The schema is additive/idempotent (`CREATE TABLE IF NOT EXISTS`); destructive changes require a migration script in `scripts/`.
4. Verify `/api/v1/health`, sign in, open Dashboard and Publishing Queue.

## Scaling notes

- Horizontal scaling requires Postgres and shared object storage; SQLite is single-node by design.
- The publishing worker is stateless; several can run against Postgres, and job claiming already guards duplicates.
- Media is served by the app; for heavy traffic put a CDN in front of `/api/v1/media/file/*` or move to S3/R2.

## Observability

- Structured logs on stdout (`[scheduler]`, `[worker]`, request errors).
- `/api/v1/health` for liveness; `/admin` for queue health, failing syncs, invalid webhooks, security events.
- `publishing_attempts` and `sync_jobs` retain every error message for post-mortems.
