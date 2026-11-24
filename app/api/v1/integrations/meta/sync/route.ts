import { z } from "zod";
import { get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { syncAccount } from "@/lib/meta-sync";
import { logAudit } from "@/lib/audit";
import { runAutomations } from "@/lib/automations";

const schema = z.object({
  accountId: z.string().min(3),
  kind: z.enum(["history", "insights", "comments"]).default("history"),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("integration.manage");
    const body = await parseJson(req, schema);
    const account = get<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM social_accounts WHERE id = ? AND workspace_id = ?",
      [body.accountId, ctx.workspace.id],
    );
    if (!account) throw new ApiError("Account not found", 404, "not_found");

    const syncId = uid();
    run(
      `INSERT INTO sync_jobs (id, workspace_id, social_account_id, kind, status, progress, records, error, started_at, finished_at, created_at)
       VALUES (?,?,?,?,'running',0,0,NULL,?,NULL,?)`,
      [syncId, ctx.workspace.id, body.accountId, body.kind, nowIso(), nowIso()],
    );

    try {
      const result = await syncAccount(ctx.workspace.id, body.accountId, body.kind ?? "history", ctx.user.id);
      run("UPDATE sync_jobs SET status = 'succeeded', progress = 100, records = ?, error = ?, finished_at = ? WHERE id = ?", [
        result.records,
        result.notes.join(" · ") || null,
        nowIso(),
        syncId,
      ]);
      logAudit(ctx, "integration.sync_completed", "social_account", body.accountId, { records: result.records }, requestIp(req));
      runAutomations(ctx.workspace.id, "sync.completed", { accountId: body.accountId, records: result.records });
      return ok({ syncId, records: result.records, notes: result.notes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      run("UPDATE sync_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", [message, nowIso(), syncId]);
      throw new ApiError(message, 422, "sync_failed");
    }
  } catch (err) {
    return handleApiError(err);
  }
}
