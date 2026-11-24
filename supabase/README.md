# Supabase / Postgres

The packaged application runs on SQLite for zero-dependency local use. This folder contains the Postgres translation of the **core**
schema plus RLS policies for teams that deploy on Supabase.

## Scope — read this first

`migrations/0001_core.sql` covers the tables the application reads and writes on its hot path:

`users`, `workspaces`, `workspace_members`, `clients`, `social_accounts`, `oauth_tokens`, `social_posts`, `post_media`,
`content_approvals`, `publishing_jobs`, `published_posts`, `post_metrics`, `account_metrics`, `media_assets`, `tasks`,
`notifications`, `reports`, `audit_logs`.

It is **not** the complete 45-table schema (campaigns, ideas, hashtags, briefs, versions, comments, inbox, automations,
competitors, webhooks, sync jobs, schedules and a few join tables still need porting). Those tables follow the same pattern and can
be translated mechanically from `db/schema.sql`. The completion report marks this work as partial.

## Applying it

```bash
# Supabase CLI
supabase link --project-ref <ref>
supabase db push

# or paste migrations/0001_core.sql into the SQL editor
```

## Wiring the app

1. Replace `lib/db/index.ts` with a `pg` pool exposing the same `all/get/run/transaction` contract.
2. Set `DATABASE_URL` (server-only) and remove `DATABASE_PATH`.
3. Optional: replace `lib/auth.ts` with Supabase Auth while keeping the `AuthContext` shape (`user`, `workspace`, `permissions`,
   `clientScope`).
4. Move uploads to Supabase Storage (`media` bucket) and keep `signMediaUrl` semantics.
5. Keep application-level permission checks: RLS is additive defence, not a replacement.

## RLS

Policies in the migration use `auth.uid()` and `workspace_members`. The service-role key must never reach the browser. If you use
the service role in route handlers, RLS is bypassed there — so the handlers must still scope every query by the authenticated
workspace, exactly as the SQLite implementation does.

## Type differences from SQLite

| SQLite | Postgres |
| --- | --- |
| `TEXT` ids | `text` (UUIDs allowed) |
| `INTEGER 0/1` booleans | `boolean` |
| ISO `TEXT` timestamps | `timestamptz` |
| JSON strings | `jsonb` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `datetime('now')` | `now()` |
| Partial indexes | Same syntax |

## Verification status

The migration has **not** been executed against a live Supabase project in this build. Treat it as a reviewed starting point, run it
in a scratch project, and diff the resulting schema against `db/schema.sql` before production use.
