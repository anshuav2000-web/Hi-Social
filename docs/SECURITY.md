# Security

## Authentication

- Passwords hashed with **scrypt** (`lib/password.mjs`): random 16-byte salt, N=16384, r=8, p=1, 64-byte key, constant-time compare.
- Sessions are opaque 32-byte random tokens in an httpOnly, SameSite=Lax cookie (`shp_session`), `Secure` when `APP_ORIGIN` is https.
- Only the SHA-256 hash of the token is stored (`sessions.token_hash`), so a database leak cannot be replayed.
- Sessions expire after 14 days; logout deletes the row immediately. `security_events` records failed logins and lockouts.
- Registration is rate limited per IP and creates a fresh workspace with the caller as `workspace_admin`.

## Authorisation

Nine roles and twenty permissions are defined in `lib/rbac.ts` and mirrored in `db/seed-rbac.sql`. Enforcement happens **server-side**
in every route through `lib/api-guard.ts`:

```ts
const ctx = await guard("content.approve");   // session → workspace → permission
```

Client components only hide controls; they are never the control. Direct API calls without the permission return 403.

| Role | Typical capability |
| --- | --- |
| super_admin | Everything, including `/admin` |
| workspace_admin | Everything in the workspace except platform admin |
| social_media_manager | Content, publishing, inbox, analytics, automations |
| content_writer / designer / video_editor | Create and edit content, upload media, work tasks |
| approver | Approve, publish, read analytics |
| analyst | Read everything, export reports |
| client_viewer | Read-only, restricted to assigned clients |

## Tenancy

- `workspace_id` is taken from the session, never from a request body.
- Cross-workspace object access returns **404**, not 403, to avoid confirming existence.
- `client_viewer` is further restricted by `client_scope` (from `workspace_members.client_scope`).
- Generic resource CRUD (`/api/v1/data/*`) validates resource keys against the registry, so table names cannot be injected.

## Tokens and secrets

- Meta access/refresh tokens are encrypted with **AES-256-GCM** (`lib/crypto.ts`), random 96-bit IV, auth tag stored with the
  ciphertext (`v1.iv.tag.data`, base64url). Key from `APP_ENCRYPTION_KEY`, otherwise generated once into `data/.encryption-key`
  with mode 0600.
- App secrets (`META_APP_SECRET`, API keys, SMTP credentials) are read from the environment inside route handlers only; no
  `NEXT_PUBLIC_*` variable carries a secret.
- The UI shows only presence/absence of secrets, never their values.
- Media is served through HMAC-signed, expiring URLs (`/api/v1/media/file/:id?exp&sig`), not by exposing the storage directory.

## Input handling

- All bodies validated with Zod; unknown fields rejected (`strict`) for registry resources.
- All SQL uses bound parameters. No string interpolation of user input.
- Uploads: MIME allowlist (jpeg, png, webp, gif, mp4, mov, pdf), 25 MB cap, extension derived from MIME, randomised filenames.
- Spreadsheet imports: size cap, row cap, formula injection guard on export (cells starting with `=`, `+`, `-`, `@` are prefixed).
- Webhooks: HMAC-SHA256 of the raw body with `META_APP_SECRET`, compared in constant time; invalid signatures are stored as
  `signature_valid = 0` and never processed. Duplicate deliveries are deduplicated by `provider:entry:time`.

## Browser hardening

- `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- No inline secrets, no `dangerouslySetInnerHTML` on user content; captions are rendered as text.
- Mutations from a foreign `Origin` are rejected (`isSameOriginRequest`), giving CSRF protection on top of SameSite cookies.

## Auditability

`audit_logs` records actor, workspace, action, entity, entity id, IP, user agent and a JSON payload for every mutation.
`security_events` records authentication and authorisation anomalies. `/admin` exposes both to super admins.

## Supabase RLS

If you move to Supabase, keep the application-level checks **and** enable RLS. Reference policies:

```sql
alter table social_posts enable row level security;

create policy "members read posts" on social_posts
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create policy "writers insert posts" on social_posts
  for insert with check (
    exists (
      select 1 from workspace_members m
      join role_permissions rp on rp.role_key = m.role_key
      where m.user_id = auth.uid()
        and m.workspace_id = social_posts.workspace_id
        and rp.permission = 'content.write'
    )
  );
```

Service-role keys must stay on the server (route handlers), never in the browser bundle.

## Reporting a problem

Email `security@socialhubpro.app` with reproduction steps. Do not open a public issue for a vulnerability.
