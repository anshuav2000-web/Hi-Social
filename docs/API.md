# API

Base path: `/api/v1`. JSON in, JSON out. Authentication is the httpOnly session cookie `shp_session`; service-to-service calls may
use `Authorization: Bearer $WORKER_SECRET` on the scheduler tick only.

## Conventions

Success: `{ "data": ... }`
Failure: `{ "error": "message", "code": "snake_code", "details": [...] }` with a matching HTTP status.

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON |
| 401 | Missing/expired session |
| 403 | Authenticated but lacking the permission (or cross-origin mutation) |
| 404 | Not found **or** outside the caller's workspace (deliberate) |
| 409 | Conflict (duplicate, illegal status transition) |
| 422 | Validation failure — `details` lists field errors |
| 429 | Rate limited by the upstream platform |
| 500 | Unhandled error (logged, never leaked) |

Every mutation writes an `audit_logs` row. Pagination: `?page=1&pageSize=25&q=&sort=&order=&filter.<field>=`.

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` → sets cookie |
| POST | `/auth/register` | Creates user + workspace (rate limited) |
| POST | `/auth/logout` | Deletes session |
| GET | `/auth/me` | User, workspace, role, permissions |
| POST | `/workspaces/switch` | Switches active workspace (membership checked) |

## Content

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/posts` | List (filters: status, client, platform, q, dates) / create |
| GET/PATCH | `/posts/:id` | Detail with media, platforms, versions, approvals / update |
| POST | `/posts/:id/actions` | `submit`, `approve`, `request_changes`, `schedule`, `unschedule`, `publish_now`, `duplicate`, `archive`, `restore` |
| GET | `/approvals` | Pending queue for the caller's stage |
| POST | `/approvals` | `{ postId, decision, note }` — stage order enforced |

## Publishing

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/queue` | Jobs, attempts, dead letter, queue state |
| POST | `/queue` | `{ action: retry|cancel|pause|resume|run_now, jobId? }` |
| POST | `/scheduler/tick` | Executes due jobs (session or `WORKER_SECRET`) |

## Integrations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/integrations/meta` | Config health, accounts, permissions, syncs |
| POST | `/integrations/meta/start` | `{ flow: "facebook" \| "instagram" }` → authorize URL + signed state |
| GET | `/integrations/meta/callback` | Exchanges code, imports accounts, redirects with status |
| POST | `/integrations/meta/sync` | `{ accountId, kind: history\|insights\|comments }` |
| POST | `/integrations/meta` | `{ accountId, action: disconnect }` |
| GET/POST | `/webhooks/meta` | Verification handshake / signed event ingestion |

## Analytics, reports, data

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/analytics?from&to&clientId` | KPIs, trend, platform split, top posts, provenance |
| GET | `/insights` | Evidence-based recommendations |
| GET/POST | `/reports` | List / generate (snapshot stored) |
| GET | `/reports/:id/export?format=xlsx\|csv\|html` | XLSX, CSV, print view |
| GET/POST | `/excel` | `mode=template`, `format=xlsx\|csv`, or multipart import (`dryRun`) |
| GET/POST | `/data/:resource` | Generic registry CRUD (clients, campaigns, tasks, media folders, …) |
| GET/PATCH/DELETE | `/data/:resource/:id` | Item operations, soft delete where configured |

## Media, inbox, work

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/media` | List / multipart upload (size + MIME validated) |
| PATCH/DELETE | `/media/:id` | Rename, tags, alt text, soft delete |
| GET | `/media/file/:id?exp&sig` | HMAC-signed delivery |
| GET/POST | `/inbox` | Threads / reply, assign, status, label |
| GET/PATCH | `/inbox/:id` | Thread detail, read state |
| GET/POST | `/tasks` | Kanban data / create |
| PATCH | `/tasks/:id` | Status, assignees, checklist, comments |

## Platform

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/search?q` | Cross-entity search |
| GET/POST | `/notifications` | Inbox / mark read / preferences |
| GET/PATCH | `/workspace` | Workspace settings |
| GET | `/members` | Team members and roles |
| GET/POST | `/brand-profiles` | Brand voice per client |
| GET/POST | `/automations` | Rules and runs |
| GET | `/openapi` | Machine-readable OpenAPI 3.1 description |
| GET | `/health` | Liveness + database probe |

## Idempotency

`POST /posts/:id/actions` with `publish_now`, `POST /excel` imports and Meta webhooks are idempotent by natural key. Repeated
calls return the existing result rather than duplicating work.
