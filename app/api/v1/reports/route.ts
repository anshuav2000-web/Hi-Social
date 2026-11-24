import { z } from "zod";
import { all, get } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { saveReport } from "@/lib/reports";
import { logAudit } from "@/lib/audit";
import { ApiError } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await guard("analytics.read");
    const rows = all(
      `SELECT r.*, c.name AS client_name, u.full_name AS created_by_name
         FROM reports r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN users u ON u.id = r.created_by
        WHERE r.workspace_id = ? ORDER BY r.created_at DESC LIMIT 100`,
      [ctx.workspace.id],
    );
    const schedules = all("SELECT * FROM report_schedules WHERE workspace_id = ? ORDER BY created_at DESC", [ctx.workspace.id]);
    return ok({
      rows: rows.map((row) => ({ ...row, payload_json: undefined })),
      schedules,
      clients: all("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]),
      emailConfigured: Boolean(process.env.SMTP_URL),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  kind: z.enum(["daily", "weekly", "monthly", "quarterly", "client", "campaign", "team"]),
  clientId: z.string().nullable().optional(),
  from: z.string(),
  to: z.string(),
  format: z.enum(["pdf", "xlsx", "csv"]).default("pdf"),
  name: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("report.export");
    const body = await parseJson(req, schema);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from) || !/^\d{4}-\d{2}-\d{2}$/.test(body.to)) {
      throw new ApiError("Dates must be YYYY-MM-DD", 422, "invalid_date");
    }
    if (new Date(body.from) > new Date(body.to)) throw new ApiError("Start date must be before the end date", 422, "invalid_range");
    if (body.clientId) {
      const client = get("SELECT id FROM clients WHERE id = ? AND workspace_id = ?", [body.clientId, ctx.workspace.id]);
      if (!client) throw new ApiError("Client not found", 404, "not_found");
    }
    const clientName = body.clientId
      ? get<{ name: string }>("SELECT name FROM clients WHERE id = ?", [body.clientId])?.name
      : null;
    const name = body.name ?? `${clientName ?? ctx.workspace.name} — ${body.kind} report ${body.from} → ${body.to}`;
    const { id } = saveReport({
      workspaceId: ctx.workspace.id,
      clientId: body.clientId ? body.clientId : null,
      name,
      kind: body.kind,
      range: { from: body.from, to: body.to },
      format: body.format ?? "pdf",
      actorId: ctx.user.id,
    });
    logAudit(ctx, "report.generated", "report", id, { kind: body.kind, format: body.format }, requestIp(req));
    return ok({ id, name });
  } catch (err) {
    return handleApiError(err);
  }
}
