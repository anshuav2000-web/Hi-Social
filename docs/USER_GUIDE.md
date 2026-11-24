# User Guide

## First run

1. Sign in (`admin@socialhubpro.app` / `SocialHub!2026` in the demo build).
2. **Clients** → add a client. Set approval stages (`internal_review,client_approval`) and brand voice in **Brand profiles**.
3. **Integrations** → connect Meta, or stay in sandbox while you build the calendar.
4. **Settings** → set the workspace timezone and holidays (they show on the calendar).

## Roles and what they see

- **Workspace admin / manager** — everything in the workspace, publishing, team.
- **Writer / designer / video editor** — content, media, tasks. No publishing, no approvals.
- **Approver** — approval queue, publishing, analytics.
- **Analyst** — read-only analytics and report export.
- **Client viewer** — only assigned clients, read-only, no exports of other clients' data.

## Planning

### Calendar
Month view with per-day chips grouped by platform. Click a day to create a post; drag a chip to another day to reschedule. Draft
statuses are colour-coded; approved items show a check. Holidays appear as muted markers.

### Post Planner (Kanban)
Columns follow the content lifecycle: Idea → Planned → Draft → In creation → Internal review → Client approval → Approved →
Scheduled → Published. Drag a card to a column only when the transition is legal — blocked transitions explain why (missing
approval, unscheduled time, missing media).

### Content Studio
- **Content** — title, caption with character counter per platform, hashtags, CTA, link.
- **Brief** — objective, audience, key message, deliverables, references.
- **Media** — upload or pick from the library; carousel ordering; alt text.
- **Preview** — platform-accurate framing, truncation warning, first-comment preview.
- **Approvals** — stage-by-stage decisions with comments and version history.
- **Scheduling** — date/time/timezone, best-time suggestions from your own data.
- Autosave keeps drafts; version history records every save.

## Approval workflow

1. Writer submits → status `internal_review`.
2. Internal approver approves or requests changes (comment required on change requests).
3. If the client requires approval, status becomes `client_approval`; the client viewer approves or requests changes.
4. All stages must pass before scheduling. Bypassing is not possible from the UI or API.

## Scheduling and publishing

- **Scheduler** lists upcoming and past slots with timezone conversion.
- **Publishing Queue** shows each job, attempt count, next retry and the platform response.
- Actions: retry (failed/dead), cancel (queued), run now (due or manual), pause/resume the workspace queue.
- A post is **Published** only when the platform returns an external id. Sandbox deliveries say **Sandbox** and have no permalink.

## Analytics

- Range picker (7/30/90 days, custom) applies to every widget.
- KPIs show deltas against the previous equal-length period.
- Provenance banner states whether numbers come from Meta, the demo dataset or are unavailable.
- Engagement rate is engagement ÷ reach; missing metrics render “—” rather than 0.
- Recommendations are labelled **fact** or **hypothesis** with their source and period.

## Reports

1. **New report** → type, client (optional), period, format.
2. The aggregate payload is stored with the report, so exports are reproducible.
3. Download XLSX/CSV or open the print view (Save as PDF).
4. Schedules are listed with the next run and recipients; email requires SMTP.

## Inbox and comments

Threads combine comments and messages per account. Assign, label, change status, reply. Replies to Facebook comments go to
`/{comment-id}/replies`; Instagram uses the IG comment endpoint. Without a live token the reply is stored as a sandbox reply and
labelled.

## Tasks

Board by status with owners, priorities, due dates, checklists, dependencies, comments and attachments. Overdue items turn red.
Linking a task to a post shows the post on the card.

## AI assistant

Choose a task (caption, hooks, hashtags, reel script, weekly plan, gap analysis…), describe the topic, pick a brand voice and
platform. Output is editable and never auto-published. Performance modes receive a real metrics snapshot; if no LLM is configured,
the template engine answers and is labelled `template`.

## Bulk Excel

Download the template, fill it, validate (dry run), then commit. Imports create drafts only. See `EXCEL_GUIDE.md`.

## Notifications

Bell icon → recent activity. **Notification Center** lists everything with mark-all-read and per-user preferences. Email requires
SMTP; browser push is not enabled.

## Tips

- Press `Ctrl/⌘ + K` for the command palette (navigation + search).
- Collapse the sidebar with the chevron for more canvas.
- Every table supports search, filters and pagination; selections export to CSV.
- If a metric looks wrong, check the provenance banner before assuming a bug.
