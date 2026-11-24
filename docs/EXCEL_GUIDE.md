# Excel & CSV Guide

## Download the template

**Reports & Exports → Bulk Excel & CSV → Template** (`GET /api/v1/excel?mode=template`) produces an `.xlsx` with the exact headers,
one example row and a styling pass wide enough to read.

## Columns

| # | Column | Required | Notes |
| --- | --- | --- | --- |
| 1 | Post Title | yes | Max 200 chars |
| 2 | Client | no | Matched by name; unknown → warning, no client |
| 3 | Campaign | no | Matched by name within the workspace |
| 4 | Platform | yes | `instagram`, `facebook`, `linkedin`, `youtube`, `tiktok`, `x`, `pinterest`, `threads` |
| 5 | Content Type | no | `image`, `carousel`, `reel`, `video`, `story`, `text`, `link` (default `image`) |
| 6 | Content Pillar | no | Free text |
| 7 | Content Brief | no | Objective / creative direction |
| 8 | Caption | no | Newlines preserved |
| 9 | Hashtags | no | Comma or space separated |
| 10 | Creative Link | no | URL to the asset (Drive, Figma, …) |
| 11 | Assigned Writer | no | Matched by full name |
| 12 | Assigned Designer | no | Matched by full name |
| 13 | Reviewer | no | Matched by full name |
| 14 | Priority | no | `low`, `medium`, `high`, `urgent` |
| 15 | Deadline | no | `YYYY-MM-DD` (stored 17:00 UTC) |
| 16 | Publish Date | no | `YYYY-MM-DD` |
| 17 | Publish Time | no | `HH:MM` 24h, default `09:00` |
| 18 | Timezone | no | IANA name, default workspace timezone |
| 19 | Approval Status | no | Informational on import |
| 20 | Publishing Status | no | Informational; imports are always drafts |
| 21 | Post ID | no | Existing id → update instead of create |

Header matching is case-insensitive and tolerant of extra spaces. Extra columns are ignored.

## Import flow

1. **Validate** (dry run) — parses, validates and returns a plan: `detectedRows`, `validRows`, `errors[]`, `warnings[]`, per-row
   preview with duplicate flags. Nothing is written.
2. **Commit** — creates drafts inside one transaction per row, returns `imported`, `scheduled` and per-row notes.

Both accept `.xlsx` (ExcelJS) and `.csv` (Papa Parse, auto-detected delimiter, UTF-8). Limits: 10 MB, 5,000 rows.

## Validation rules

| Rule | Severity |
| --- | --- |
| Missing title | error |
| Unsupported platform | error |
| Invalid date/time | error |
| Caption > 2,200 chars | error |
| Duplicate title in the same file | error |
| Duplicate title already in the workspace | warning + `duplicate: true` |
| Unknown client/campaign/user | warning (row still imports) |
| Publish date in the past | warning (imported unscheduled) |

Rows with errors are skipped; valid rows still import. Nothing is partially written inside a row.

## Scheduling on import

Optional checkbox. Rules:

- `client.approval_required = 1` → row imports as a **draft**, note: “approval required before scheduling”.
- No assets, blocked channel coverage or invalid caption → scheduling is refused with the reason; the draft still imports.
- Scheduled jobs go through the same validation as the UI, so the queue never contains an invalid job.

## Export

`GET /api/v1/excel?format=xlsx|csv` exports the filtered post list with the same 21 columns plus metrics columns when available.
Formula injection is neutralised: cells beginning with `=`, `+`, `-` or `@` are prefixed with an apostrophe.

## Report exports

`GET /api/v1/reports/:id/export?format=`

| Format | Behaviour |
| --- | --- |
| `xlsx` | Workbook with Summary, KPIs, Top content and Recommendations sheets |
| `csv` | Flat KPI + content rows |
| `html` | Print-optimised page → browser **Print → Save as PDF** (A4, headers/footers, page breaks) |

No PDF binary is generated server-side; the print view is the supported PDF path.
