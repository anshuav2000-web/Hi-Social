import { all, get } from "@/lib/db";
import { created, handleApiError, ok } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { buildTemplateWorkbook, buildWorkbook, parseImportFile, toCsv, validateImport } from "@/lib/excel";
import { createPost } from "@/lib/posts";
import { schedulePost } from "@/lib/posts";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    if (mode === "template") {
      await guard("content.write");
      const buffer = await buildTemplateWorkbook();
      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="socialhub-pro-bulk-planner-template.xlsx"',
        },
      });
    }

    const ctx = await guard("content.read");
    const format = url.searchParams.get("format") ?? "xlsx";
    const rows = all<{
      id: string;
      title: string;
      client_name: string | null;
      campaign_name: string | null;
      platform: string;
      content_type: string;
      content_pillar: string | null;
      caption: string | null;
      hashtags: string | null;
      status: string;
      priority: string;
      deadline: string | null;
      scheduled_at: string | null;
      timezone: string;
      writer_name: string | null;
      designer_name: string | null;
      reviewer_name: string | null;
    }>(
      `SELECT p.id, p.title, c.name AS client_name, cmp.name AS campaign_name, p.platform, p.content_type, p.content_pillar,
              p.caption, p.hashtags, p.status, p.priority, p.deadline, p.scheduled_at, p.timezone,
              w.full_name AS writer_name, d.full_name AS designer_name, r.full_name AS reviewer_name
         FROM social_posts p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN campaigns cmp ON cmp.id = p.campaign_id
         LEFT JOIN users w ON w.id = p.assigned_writer_id LEFT JOIN users d ON d.id = p.assigned_designer_id
         LEFT JOIN users r ON r.id = p.reviewer_id
        WHERE p.workspace_id = ? ORDER BY p.created_at DESC`,
      [ctx.workspace.id],
    );

    const headers = [
      "Post ID", "Client", "Campaign", "Post Title", "Platform", "Content Type", "Content Pillar", "Caption", "Hashtags",
      "Assigned Writer", "Assigned Designer", "Reviewer", "Priority", "Deadline", "Publish Date", "Publish Time",
      "Timezone", "Approval Status", "Publishing Status",
    ];
    const records = rows.map((row) => [
      row.id,
      row.client_name,
      row.campaign_name,
      row.title,
      row.platform,
      row.content_type,
      row.content_pillar,
      row.caption,
      row.hashtags,
      row.writer_name,
      row.designer_name,
      row.reviewer_name,
      row.priority,
      row.deadline?.slice(0, 10) ?? "",
      row.scheduled_at?.slice(0, 10) ?? "",
      row.scheduled_at ? new Date(row.scheduled_at).toISOString().slice(11, 16) : "",
      row.timezone,
      row.status,
      row.status === "published" ? "Published" : row.scheduled_at ? "Scheduled" : "Draft",
    ]);

    if (format === "csv") {
      const csv = toCsv(headers, records);
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="socialhub-content-export.csv"' },
      });
    }
    const buffer = await buildWorkbook("Content", headers, records, {
      title: "Content export",
      subtitle: `${ctx.workspace.name} · ${records.length} posts`,
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="socialhub-content-export.xlsx"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await guard("content.write");
    const form = await req.formData().catch(() => null);
    if (!form) throw new ApiError("Upload must be multipart/form-data", 400, "invalid_form");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("A .xlsx or .csv file is required", 422, "missing_file");
    if (file.size > 15 * 1024 * 1024) throw new ApiError("File exceeds the 15 MB limit", 413, "too_large");
    const dryRun = String(form.get("dryRun") ?? "true") !== "false";
    const scheduleImported = String(form.get("schedule") ?? "false") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseImportFile(buffer, file.name);
    const { valid, issues } = validateImport(parsed.rows);

    const clients = all<{ id: string; name: string; approval_required: number }>(
      "SELECT id, name, approval_required FROM clients WHERE workspace_id = ?",
      [ctx.workspace.id],
    );
    const users = all<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN workspace_members wm ON wm.user_id = u.id WHERE wm.workspace_id = ?`,
      [ctx.workspace.id],
    );
    const campaigns = all<{ id: string; name: string }>("SELECT id, name FROM campaigns WHERE workspace_id = ?", [ctx.workspace.id]);

    const resolve = <T extends { id: string; name?: string; full_name?: string }>(list: T[], value: string | undefined, key: "name" | "full_name" = "name") =>
      list.find((item) => String(item[key] ?? "").toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;

    const plan: {
      row: number;
      title: string;
      platform: string;
      client: string | null;
      warnings: string[];
      duplicate: boolean;
    }[] = [];

    for (const [index, row] of valid.entries()) {
      const clientId = resolve(clients, row.clientName);
      const warnings: string[] = [];
      if (row.clientName && !clientId) warnings.push(`Client “${row.clientName}” not found — the post will be created without a client.`);
      if (row.campaignName && !resolve(campaigns, row.campaignName)) warnings.push(`Campaign “${row.campaignName}” not found — ignored.`);
      if (row.writer && !resolve(users, row.writer, "full_name")) warnings.push(`Writer “${row.writer}” is not a workspace member — left unassigned.`);
      const duplicate = Boolean(
        get<{ id: string }>(
          `SELECT id FROM social_posts WHERE workspace_id = ? AND lower(title) = lower(?) AND platform = ?
             AND date(COALESCE(scheduled_at, created_at)) = date(COALESCE(?, created_at))`,
          [ctx.workspace.id, row.title, row.platform, row.publishDate ? `${row.publishDate}T00:00:00.000Z` : null],
        ),
      );
      if (duplicate) warnings.push("A post with the same title, platform and publish date already exists in this workspace.");
      plan.push({ row: index + 2, title: row.title, platform: row.platform, client: row.clientName ?? null, warnings, duplicate });
    }

    if (dryRun) {
      return ok({
        dryRun: true,
        format: parsed.format,
        headers: parsed.headers,
        detectedRows: parsed.rows.length,
        validRows: valid.length,
        errors: issues.filter((i) => i.severity === "error"),
        warnings: issues.filter((i) => i.severity === "warning"),
        plan,
        message:
          valid.length === 0
            ? "No valid rows found. Fix the listed errors and re-upload."
            : `Ready to import ${valid.length} post(s). Nothing is published by an import.`,
      });
    }

    if (issues.some((i) => i.severity === "error")) {
      throw new ApiError("Import blocked: fix the validation errors first", 422, "import_invalid", issues);
    }

    const imported: { id: string; title: string; scheduled: boolean; note?: string }[] = [];
    for (const row of valid) {
      const clientId = resolve(clients, row.clientName);
      const client = clientId ? clients.find((c) => c.id === clientId) : null;
      const detail = createPost(ctx, {
        title: row.title,
        platform: row.platform as never,
        content_type: row.contentType as never,
        client_id: clientId,
        campaign_id: resolve(campaigns, row.campaignName),
        caption: row.caption ?? null,
        hashtags: row.hashtags ?? null,
        content_pillar: row.pillar ?? null,
        priority: row.priority as never,
        assigned_writer_id: resolve(users, row.writer, "full_name"),
        assigned_designer_id: resolve(users, row.designer, "full_name"),
        reviewer_id: resolve(users, row.reviewer, "full_name"),
        deadline: row.deadline ? new Date(`${row.deadline}T17:00:00.000Z`).toISOString() : null,
        timezone: row.timezone,
        status: "draft",
        brief: row.brief ?? null,
        reference_files: row.creativeLink ?? null,
        approval_required: client ? Boolean(client.approval_required) : true,
        media_asset_ids: [],
      });
      const postId = (detail.post as unknown as { id: string }).id;

      if (scheduleImported && row.publishDate) {
        const time = row.publishTime || "09:00";
        const runAt = new Date(`${row.publishDate}T${time}:00.000Z`).toISOString();
        if (client && client.approval_required) {
          imported.push({ id: postId, title: row.title, scheduled: false, note: "Created as draft — approval is required before scheduling." });
        } else {
          try {
            schedulePost(ctx, postId, { scheduledAt: runAt }, undefined, false);
            imported.push({ id: postId, title: row.title, scheduled: true });
          } catch (err) {
            imported.push({
              id: postId,
              title: row.title,
              scheduled: false,
              note: err instanceof Error ? err.message : "Scheduling failed",
            });
          }
        }
      } else {
        imported.push({ id: postId, title: row.title, scheduled: false, note: "Created as draft." });
      }
    }

    logAudit(ctx, "excel.imported", "social_post", null, { count: imported.length, scheduleImported, file: file.name }, undefined);
    return created({
      dryRun: false,
      imported: imported.length,
      scheduled: imported.filter((i) => i.scheduled).length,
      results: imported,
      message: "Import complete. Imported content is never published automatically.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
