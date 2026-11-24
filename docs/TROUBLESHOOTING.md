# Troubleshooting

## Startup

**`ERR_UNSUPPORTED_ESM_URL_SCHEME` when running scripts on Windows**
Absolute Windows paths cannot be passed to `import()`. `scripts/migrate.mjs` converts them with `pathToFileURL`. If you add new
scripts, do the same.

**`Cannot find module 'node:sqlite'`**
Node < 22.5. Upgrade to Node 24 (`node -v`).

**`FOREIGN KEY constraint failed` during seeding**
The seed inserts rows in dependency order. Reset with `npm run db:reset`; if it persists, the seed references an id that no longer
exists — check `db/seed.mjs` for the affected table.

**Port 3000 in use**

```bash
netstat -ano | grep ':3000' | grep LISTENING
taskkill //PID <pid> //F     # Windows
```

**App boots but every page is 500**
Check the server log for the first stack trace. A common cause is rows with a null prototype reaching a client component — the
`all()`/`get()` helpers already normalise rows, so custom raw queries through `getDb()` need `{ ...row }`.

## Authentication

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login says invalid credentials | Seeded password changed, or `SEED_DEMO=false` on an empty DB | Reset the DB or register a new account |
| Redirect loop to /login | Cookie not sent (wrong origin, proxy stripping) | Use the same origin as `APP_ORIGIN`; check proxy headers |
| 403 on every action | Role lacks the permission | Check the role matrix in `lib/rbac.ts`; `/admin` shows roles |
| Client viewer sees nothing | `client_scope` empty | Assign clients in Team |

## Publishing

| Symptom | Cause | Fix |
| --- | --- | --- |
| Post stays `scheduled` forever | Scheduler disabled and no worker | Set `ENABLE_INPROCESS_SCHEDULER=true` or start `npm run worker` |
| Job fails with “No connected account” | Account disconnected or filtered by client | Connect/reconnect in Integrations |
| Job fails with “approval required” | Client requires approval, post not approved | Run the approval stages |
| Job fails with `(#190)` | Token expired | Reauthorise the account |
| Duplicate-looking posts | Two different accounts or reschedule created a new slot | Queue shows account + run time; idempotency key prevents true duplicates |
| “Sandbox” badge | No live Meta token | Configure Meta and reauthorise — this is expected, not a bug |
| Dead-letter job | 5 failed attempts | Read the last attempt's error, fix, then Retry |

## Analytics

| Symptom | Cause | Fix |
| --- | --- | --- |
| Everything is “—” | No metrics rows for the range | Run a sync or seed demo data |
| Numbers look like demo data | Provenance banner says demo | Production installs set `SEED_DEMO=false` and sync from Meta |
| Engagement rate 0% | Reach is 0 for that post | Rate is engagement ÷ reach; a 0 denominator is reported as unavailable |
| Date range returns nothing | Timezone boundary | Metrics are stored UTC by `captured_on` date |

## Integrations

**Meta is not configured** — `META_APP_ID`/`META_APP_SECRET` missing. OAuth buttons return a clear error instead of failing silently.

**`Invalid OAuth redirect URI`** — copy the exact value from the error into Meta's Valid OAuth Redirect URIs; no trailing slash.

**`(#10) Application does not have permission`** — App Review not granted, or the signed-in user is not an admin/tester.

**Webhook verification 403** — verify token mismatch, or the handler received a rewritten body.

**Signature invalid rows** — the proxy altered the raw body, or `META_APP_SECRET` is wrong.

## Excel

**“No rows detected”** — the first sheet is empty or headers are on a later sheet. Put headers in row 1 of the first sheet.

**Everything is an error** — required columns (Post Title, Platform) are missing or misnamed. Use the template.

**Import succeeded but nothing scheduled** — client requires approval, or publish dates were in the past.

## Email / notifications

No email arrives when `SMTP_URL` is unset; in-app notifications still work. `SMTP_FROM` must be allowed by your provider. Check
`/admin` and the server log for SMTP errors.

## Performance

- SQLite is single-node. Heavy exports or imports can hold the write lock briefly (`busy_timeout` is 5s).
- Large media should go to object storage; the app serves files through signed routes, not a CDN.
- Analytics queries are indexed on `(account_id, captured_on)`; avoid ranges over several years on SQLite.

## Getting help

1. `/admin` → queue health, failing syncs, security events.
2. Server log around the failing request.
3. `publishing_attempts` / `sync_jobs` rows for the exact platform error.
4. Reproduce with `npm run dev` and check the network response body (`error`, `code`, `details`).
