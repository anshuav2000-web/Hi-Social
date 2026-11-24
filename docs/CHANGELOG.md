# Changelog

All notable changes to SocialHub Pro. Versioning follows `MAJOR.MINOR.PATCH`.

## [1.0.0] — 2026-11-18

Initial release.

### Added

- **Workspaces & access** — multi-workspace tenancy, 9 roles, 20 permissions, session auth with scrypt + hashed session tokens,
  audit log, security events, workspace switching.
- **Clients & brand** — client records with approval stages, brand profiles (voice, audience, pillars, banned words), contacts.
- **Content** — Content Studio (brief, caption, media, preview, versions, comments), calendar with drag rescheduling, post planner
  Kanban, campaigns, content ideas, hashtag collections.
- **Approvals** — configurable multi-stage chains, decisions with comments, version snapshots, enforced ordering.
- **Publishing** — durable job queue with unique idempotency keys, 1/5/15/60/240-minute backoff, dead letter, rate-limit requeue,
  cancel/retry/run-now, queue pause, sandbox channel, in-process scheduler and standalone worker.
- **Meta integration** — Graph API v23.0 client, Facebook Login and Instagram Login flows, encrypted token storage, Page and
  Instagram account discovery, 90-day insight sync, comment ingestion via HMAC-verified webhooks, comment replies.
- **Analytics** — account and post metrics with provenance, KPI deltas, platform and content-type breakdown, best posting windows,
  top/bottom content, evidence-based recommendations.
- **Reports** — snapshot-based reports (daily → team), XLSX/CSV export, print-to-PDF view, schedules.
- **Excel** — styled template, validated import with dry-run preview, duplicate detection, optional scheduling, formula-injection
  guard on export.
- **Inbox** — unified comment/message threads, assignment, labels, statuses, replies.
- **Tasks** — board, assignees, checklists, dependencies, comments, attachments.
- **Automations** — trigger → condition → action rules with run history.
- **AI** — 18 assist modes, brand-voice aware, Ollama → OpenAI-compatible → deterministic templates, metrics-grounded performance
  advice.
- **Admin** — queue/worker health, storage, integration health, failing syncs, webhook verification stats, users, workspaces, audit
  and security feeds.
- **Docs** — in-app documentation plus 12 operator/developer documents, OpenAPI description, health endpoint.
- **Deployment** — multi-stage Dockerfile, Compose stack with dedicated worker, Coolify instructions, backup guidance.
- **Tests** — Vitest suites for RBAC, formatting and the resource registry; Playwright smoke specs.

### Known limitations

- Live publishing supports Instagram and Facebook Pages only.
- PDF export is a print view, not a server-generated binary.
- SQLite is the runtime database; a Postgres/Supabase path is documented with a core migration.
- Email requires SMTP; browser push is not implemented.
- Meta App Review is external and must be completed by the app owner.

## [Unreleased]

- Postgres data adapter and Supabase Auth adapter.
- LinkedIn and YouTube publishers.
- Server-rendered PDF export.
- Two-factor authentication.
