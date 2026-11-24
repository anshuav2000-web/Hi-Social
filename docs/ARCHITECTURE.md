# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Server components for data-heavy pages, route handlers for the API, one deployable |
| UI | React 19, Tailwind CSS v4 | Design tokens in `app/globals.css`, no runtime CSS-in-JS |
| Charts | Recharts | Accessible SVG charts that work in server-rendered pages via client wrappers |
| Validation | Zod | The same schemas validate API bodies and generate form behaviour |
| Database | `node:sqlite` | Zero native dependencies, boots with no configuration |
| Files | Local disk (`STORAGE_DIR`) | Signed URLs; swap `lib/media.ts` for S3/R2 in production |
| AI | Ollama → OpenAI-compatible → templates | Local-first, no vendor lock-in, deterministic fallback |
| Tests | Vitest (+ Playwright) | Fast unit tests over pure domain logic |

## Directory map

```
app/
  (auth)/login, register        Public auth pages
  (app)/...                     Authenticated shell (sidebar, topbar, command palette)
  api/v1/...                    REST surface (route handlers)
components/                     Client components + shared primitives
lib/                            Domain logic (no React)
  db/                           SQLite bootstrap + query helpers
  auth.ts, rbac.ts, api-guard   Identity, permissions, request guards
  posts.ts, publishing.ts       Content lifecycle and delivery engine
  meta.ts, meta-sync.ts         Graph API client and importers
  analytics.ts, insights.ts     Aggregations and evidence-based recommendations
  ai.ts, automations.ts         Generation and rule engine
  reports.ts, excel.ts          Reporting and spreadsheet I/O
db/                             schema.sql, seed-rbac.sql, seed.mjs
scripts/                        migrate.mjs, worker.mjs
tests/                          Vitest unit tests, Playwright specs
docs/                           Operator and developer documentation
```

## Request lifecycle

1. **Route handler** parses the request and calls `guard(permission)` from `lib/api-guard.ts`.
2. `guard` resolves the session cookie (`shp_session` → SHA-256 hash → `sessions` row), loads the user, the active workspace
   membership and the role's permissions from the database.
3. `requirePermission` rejects with 403 when the permission is absent. Client viewers additionally receive a `client_scope` list.
4. The handler validates the body with Zod, then calls a domain function in `lib/`.
5. Domain functions write through `lib/db` (parameterised SQL only) inside a transaction when multi-row consistency matters.
6. `logAudit` records actor, action, entity, workspace, IP and a JSON diff for every mutation.
7. The response uses `{ data }` on success and `{ error, code, details }` on failure.

Server components call the same lib functions directly, which is why pages render without a client-side data waterfall.

## Publishing engine

```
schedulePost() ──► validation ──► enqueue() ──► publishing_jobs (unique idempotency_key)
                                                     │
                       scheduler tick / worker ──────┤
                                                     ▼
                                        claim job (status=running, attempt++)
                                                     │
                    ┌────────────────────────────────┴────────────────────────────┐
                    ▼                                                             ▼
            live Meta delivery                                          sandbox delivery
     (image / carousel / reel / story / feed)                    (channel='sandbox', no external id)
                    │                                                             │
                    └──────────────► published_posts + post status published ◄────┘
                                                     │
                                          failure → backoff 1/5/15/60/240 min
                                                     │
                                             dead letter after 5 attempts
```

- `idempotency_key = post:account:scheduled_at` plus a unique index prevents duplicate delivery even if two workers race.
- Rescheduling cancels a previously queued job for the same post before inserting the new one.
- Meta rate-limit errors (codes 4, 17, 32, 613) requeue without consuming an attempt.
- Container status polling handles Instagram's asynchronous `IN_PROGRESS` → `FINISHED` transition.
- Jobs are claimed with `UPDATE ... WHERE status='queued'` and checked via `changes`, so a second worker cannot take the same job.
- A stopped app resumes queued work on the next tick; nothing lives only in memory.

## Multi-tenancy

Every tenant-owned row stores `workspace_id`. Reads always filter by the authenticated workspace; writes always inject it from the
session, never from the request body. Client-scoped roles (`client_viewer`) are further filtered through `client_scope`. There is
no endpoint that accepts a workspace id from the client.

## Design decisions

- **SQLite first.** The deliverable must run on a clean machine with `npm install && npm run dev`. The schema is written in
  portable SQL with a documented Postgres path.
- **One resource registry.** ~20 CRUD modules share `lib/modules.ts`, `/api/v1/data/[resource]` and `ResourceManager`, so
  validation, permissions, pagination, filters and audit are implemented once.
- **Honest degradation.** Missing Meta credentials produce sandbox deliveries and visible badges. Missing LLM credentials produce
  template output labelled `template`. Missing metrics stay `NULL` and render as “—”.
- **No client-side secrets.** All Meta/AI calls happen in route handlers or server components.
- **Idempotency everywhere it matters.** Publishing, webhook ingestion and imports all carry natural keys.
