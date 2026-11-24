# Database

## Runtime

Local and default Docker runtime use Node's built-in **SQLite** (`node:sqlite`), file at `DATABASE_PATH`
(`./data/socialhub.db`). WAL mode, foreign keys on, 5s busy timeout. `db/schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`)
and is applied on first boot and by `npm run db:migrate`. `db/seed-rbac.sql` inserts the 9 roles and 20 permissions.

## Conventions

- Text UUID/ULID identifiers for portability.
- ISO-8601 UTC timestamps (`TEXT`).
- Booleans are `INTEGER 0/1`.
- Money in integer cents.
- Every tenant row has `workspace_id` with `ON DELETE CASCADE`.
- `source` columns record provenance (`meta`, `demo`, `manual`).
- Soft deletes (`deleted_at`) for media and posts where recovery matters.

## Tables (grouped)

**Identity & access** — `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `workspaces`, `workspace_members`,
`audit_logs`, `security_events`, `api_idempotency`.

**Clients & brand** — `clients`, `brand_profiles` (voice, audience, pillars, banned words), `client_contacts`.

**Social accounts** — `social_accounts` (platform, external id, type, status, followers, scopes, last sync), `oauth_connections`,
`oauth_tokens` (encrypted access/refresh tokens, expiry), `oauth_states` (CSRF state, PKCE verifier, 10-minute TTL).

**Content** — `social_posts` (status, caption, hashtags, brief, scheduling, approval flags), `post_media`, `post_platforms`,
`post_versions`, `content_briefs`, `content_comments`, `content_approvals`, `content_ideas`, `campaigns`, `campaign_posts`,
`hashtag_collections`.

**Media** — `media_folders`, `media_assets` (dimensions, size, mime, checksum, tags, alt text).

**Publishing** — `publishing_jobs` (unique `idempotency_key`), `publishing_attempts`, `published_posts` (external post id,
permalink, channel `meta|sandbox`), `queue_state` (per-workspace pause).

**Analytics** — `post_metrics`, `account_metrics`, `analytics_snapshots`. Unique keys on `(entity, captured_on)` make syncs
idempotent. Engagement rate is derived, never stored.

**Inbox** — `inbox_conversations`, `inbox_messages` (direction, external id, read state).

**Work management** — `tasks`, `task_assignees`, `task_comments`, `task_attachments`, `task_checklist`, `task_dependencies`.

**Automation** — `automations` (trigger, conditions, actions), `automation_runs`.

**Reporting** — `reports` (stored JSON payload + rows), `report_schedules`.

**Competitors** — `competitor_accounts`, `competitor_posts`, `competitor_metrics`.

**Integration plumbing** — `integration_webhooks` (unique provider+external id, signature validity), `sync_jobs`.

**Notifications** — `notifications` (user or workspace broadcast, link, read state).

## Key relationships

```
users ──< workspace_members >── workspaces ──< clients ──< social_accounts
                                    │              │
                                    ├──< social_posts ──< post_media
                                    │        │
                                    │        ├──< content_approvals
                                    │        ├──< post_metrics
                                    │        └──< publishing_jobs ──< publishing_attempts
                                    └──< media_assets, tasks, automations, reports, audit_logs
```

## Indexes

Hot paths are indexed: `social_posts(workspace_id, scheduled_at)`, `social_posts(workspace_id, status)`,
`publishing_jobs(status, run_at)`, `account_metrics(social_account_id, captured_on)`, `post_metrics(post_id, captured_on)`,
`notifications(user_id, is_read)`, `audit_logs(workspace_id, created_at)`, `sessions(token_hash)`,
`integration_webhooks(external_id)`.

## Postgres / Supabase

`supabase/migrations/0001_init.sql` provides the Postgres translation: `UUID`/`TEXT` keys, `timestamptz`, `boolean`, `jsonb`,
`gender`-free enums replaced with `CHECK` constraints, and `updated_at` triggers. Supabase deployments should enable RLS using the
policies in `docs/SECURITY.md`; the app's server-side scoping remains the primary control.

Migration checklist:

1. Create the Supabase project and run `0001_init.sql` in the SQL editor (or `supabase db push`).
2. Point the data layer at Postgres (replace `lib/db/index.ts`; the `all/get/run/transaction` contract is deliberately small).
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` server-side only.
4. Optional: replace `lib/auth.ts` with Supabase Auth, keeping `AuthContext` shape (`user`, `workspace`, `permissions`,
   `clientScope`) so domain code is untouched.
5. Move uploads to Supabase Storage (`media` bucket) and keep `signMediaUrl` semantics.

## Reset / seed

```bash
npm run db:reset     # drops the file, applies schema, seeds demo workspace
npm run db:migrate   # applies schema only (seeds if empty)
node scripts/migrate.mjs --no-seed
```

The demo seed is deterministic (`mulberry32(20261118)`), so analytics screenshots are reproducible.
