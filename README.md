# SocialHub Pro

**The AI-powered social media operating system** — plan, produce, approve, schedule, publish and measure Instagram and Facebook
content from one workspace. Built with Next.js 15, React 19, TypeScript and SQLite, with a real Meta Graph API integration and an
explicit sandbox mode when credentials are absent.

---

## What is actually implemented

| Area | Detail |
| --- | --- |
| Multi-client workspaces | Unlimited clients, brand profiles, approval rules, per-client colour and reporting scope |
| Content production | Content Studio (brief, caption, media, variants, preview), calendar, post planner, campaigns, ideas, hashtag sets |
| Approvals | Multi-stage approval chains (internal review → legal → client), version history, reviewer comments and decisions |
| Scheduling & publishing | Durable job queue, idempotency keys, exponential backoff, dead letter, sandbox delivery, queue pause/resume, retry/cancel |
| Meta integration | OAuth (Facebook Login + Instagram Login paths), Page and IG account discovery, encrypted tokens, historical insights sync, comment webhooks with HMAC verification |
| Publishing | Facebook Page photo/feed posts, Instagram image, carousel, reel and story containers with status polling |
| Analytics | Reach, impressions, engagement, followers, per-post and per-account metrics with `source` provenance, best-time analysis |
| Reports | Daily/weekly/monthly/quarterly/client/campaign/team reports with stored payload snapshots; XLSX, CSV and print-to-PDF export |
| Inbox | Comment/message threads, assignment, statuses, labels, replies via Graph API (sandbox otherwise) |
| Tasks | Kanban with assignees, checklists, comments, attachments and dependencies |
| Automation | Rule engine (trigger → condition → action) with run history, wired to the publishing worker |
| Governance | 9 roles, 20 permissions, server-side enforcement, audit log, security events, session revocation |
| AI | 18 assist modes, brand-voice aware, Ollama → OpenAI-compatible → deterministic template fallback |
| Excel | Template generation, validated import with dry-run preview, XLSX/CSV export |
| Docs | In-app documentation plus the `docs/` folder |

Nothing in the UI is a placeholder: every button calls an endpoint that validates input, checks permissions, writes to the database
and writes an audit entry. Where an external credential is missing, the feature degrades to an explicitly labelled sandbox path
instead of pretending to be live.

---

## Quick start

```bash
# Node 22.5+ is required (node:sqlite). Node 24 recommended.
npm install
cp .env.example .env          # optional; sensible defaults apply
npm run db:migrate            # creates data/socialhub.db and seeds the demo workspace
npm run dev                   # http://localhost:3000
```

Sign in with the seeded administrator:

```
admin@socialhubpro.app
SocialHub!2026
```

Other seeded users: `maya@socialhubpro.app` (manager), `noah@` (writer), `lena@` (designer), `sam@` (approver),
`ivy@` (analyst), `client@lumina.test` (client viewer). All share the demo password above.

> The demo workspace is flagged `is_demo = 1`, its accounts are `sandbox`, and every metric row carries
> `source = 'demo'`. Production installs set `SEED_DEMO=false`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright smoke tests (needs a running server) |
| `npm run db:migrate` / `npm run db:reset` | Apply schema / drop and reseed |
| `npm run worker` | Standalone publishing worker (Docker) |

---

## Sandbox vs live publishing

Publishing is **live** only when the account has a decrypted Meta token and `META_APP_ID`/`META_APP_SECRET` are configured.
Otherwise the job completes through the sandbox channel: `published_posts.channel = 'sandbox'`, no external post id, and the UI
labels the result "Sandbox". A sandbox result is *never* reported as a live Meta post.

To go live: follow [`docs/META_SETUP.md`](docs/META_SETUP.md), set the `META_*` variables, connect accounts in
**Integrations**, then reauthorise. Meta App Review is an external, manual process.

---

## Configuration

Every value is optional for local use; see `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | `http://localhost:3000` | Absolute links and OAuth callbacks |
| `DATABASE_PATH` | `./data/socialhub.db` | SQLite file |
| `STORAGE_DIR` | `./storage/uploads` | Media uploads |
| `APP_ENCRYPTION_KEY` | generated | AES-256-GCM key for OAuth tokens |
| `WORKER_SECRET` | — | Bearer token for `/api/v1/scheduler/tick` |
| `SEED_DEMO` | `true` | Seed demo data on first boot |
| `ENABLE_INPROCESS_SCHEDULER` | `true` | In-app publishing loop |
| `SCHEDULER_INTERVAL_SECONDS` | `20` | Worker tick interval |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_VERSION`, `META_WEBHOOK_VERIFY_TOKEN` | — | Meta Graph integration |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | — | Local LLM for the assistant |
| `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL` | — | External LLM adapter |
| `SMTP_URL`, `SMTP_FROM` | — | Email notifications |

Secrets are read server-side only. Tokens are encrypted at rest; the browser never receives a token or app secret.

---

## Architecture at a glance

```
Browser (React 19, Tailwind v4)
   │  fetch /api/v1/*
Next.js route handlers ── api-guard (session → workspace → permission → client scope)
   │
lib/* domain modules ──► node:sqlite (data/socialhub.db)
   │                        └─ schema.sql + seed-rbac.sql
   ├─► lib/meta.ts ──► graph.facebook.com
   ├─► lib/ai.ts ──► Ollama / OpenAI-compatible / templates
   └─► storage/uploads (signed URLs)
```

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · data model: [`docs/DATABASE.md`](docs/DATABASE.md) ·
API: [`docs/API.md`](docs/API.md) · deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Documentation

| File | Contents |
| --- | --- |
| `docs/ARCHITECTURE.md` | Modules, request flow, design decisions |
| `docs/DATABASE.md` | Tables, relationships, Postgres/Supabase path |
| `docs/API.md` | REST surface, payloads, error contract |
| `docs/SECURITY.md` | Auth, RBAC, tenancy, token encryption, RLS intent |
| `docs/DEPLOYMENT.md` | Docker, Compose, Coolify, backups, scaling |
| `docs/META_SETUP.md` | Meta app, permissions, App Review, troubleshooting |
| `docs/OAUTH_SETUP.md` | OAuth flows explained step by step |
| `docs/WEBHOOK_SETUP.md` | Webhook verification and subscriptions |
| `docs/EXCEL_GUIDE.md` | Template columns and import rules |
| `docs/USER_GUIDE.md` | Day-to-day workflows per role |
| `docs/TROUBLESHOOTING.md` | Symptom → cause → fix |
| `docs/CHANGELOG.md` | Version history |
| `COMPLETION_REPORT.md` | Per-feature status matrix |

## Known limits

- Live publishing covers **Instagram** and **Facebook Pages**. Other networks are modelled in the schema and UI but have no live
  publisher, and the UI says so.
- Instagram/Facebook direct messages require extra Meta permissions; comment threads work through the API.
- PDF export is a print-optimised HTML view (browser → Save as PDF); no PDF binary is produced server-side.
- The bundled database is SQLite. A Postgres/Supabase migration is provided for hosted deployments; RLS policies are documented in
  `docs/SECURITY.md`.
- Email and browser push require SMTP/VAPID configuration; in-app notifications always work.
