import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { all, get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { aiStatus } from "@/lib/ai";
import { describeMetaConfig } from "@/lib/meta";

export async function GET() {
  try {
    const ctx = await guard("workspace.read");
    const workspace = get("SELECT * FROM workspaces WHERE id = ?", [ctx.workspace.id]);
    const counts = {
      clients: get<{ n: number }>("SELECT COUNT(*) AS n FROM clients WHERE workspace_id = ?", [ctx.workspace.id])?.n ?? 0,
      members: get<{ n: number }>("SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND status = 'active'", [ctx.workspace.id])?.n ?? 0,
      posts: get<{ n: number }>("SELECT COUNT(*) AS n FROM social_posts WHERE workspace_id = ?", [ctx.workspace.id])?.n ?? 0,
      assets: get<{ n: number }>("SELECT COUNT(*) AS n FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL", [ctx.workspace.id])?.n ?? 0,
    };
    const storageBytes =
      get<{ total: number | null }>("SELECT SUM(size_bytes) AS total FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL", [
        ctx.workspace.id,
      ])?.total ?? 0;

    return ok({
      workspace,
      counts,
      storageBytes,
      storageDir: env.storageDir || path.join(process.cwd(), "storage", "uploads"),
      storageDirExists: fs.existsSync(env.storageDir || path.join(process.cwd(), "storage", "uploads")),
      meta: describeMetaConfig(),
      ai: await aiStatus(),
      email: { configured: Boolean(env.smtpUrl), from: env.smtpFrom },
      integrations: all("SELECT platform, COUNT(*) AS n FROM social_accounts WHERE workspace_id = ? GROUP BY platform", [ctx.workspace.id]),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  timezone: z.string().max(60).optional(),
  logoColor: z.string().max(20).optional(),
  settings: z
    .object({
      holidays: z.array(z.string()).optional(),
      workingHours: z.string().max(20).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    const ctx = await guard("workspace.manage");
    const body = await parseJson(req, schema);
    const current = get<{ settings_json: string }>("SELECT settings_json FROM workspaces WHERE id = ?", [ctx.workspace.id]);
    if (!current) throw new ApiError("Workspace not found", 404, "not_found");
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(current.settings_json || "{}");
    } catch {
      settings = {};
    }
    if (body.name) run("UPDATE workspaces SET name = ? WHERE id = ?", [body.name, ctx.workspace.id]);
    if (body.timezone) run("UPDATE workspaces SET timezone = ? WHERE id = ?", [body.timezone, ctx.workspace.id]);
    if (body.logoColor) run("UPDATE workspaces SET logo_color = ? WHERE id = ?", [body.logoColor, ctx.workspace.id]);
    if (body.settings) {
      const merged = { ...settings, ...((body.settings ?? {}) as Record<string, unknown>) };
      run("UPDATE workspaces SET settings_json = ? WHERE id = ?", [JSON.stringify(merged), ctx.workspace.id]);
    }
    logAudit(ctx, "workspace.updated", "workspace", ctx.workspace.id, body, requestIp(req));
    const updated = get<Record<string, unknown>>("SELECT * FROM workspaces WHERE id = ?", [ctx.workspace.id]);
    return ok({ ...(updated ?? {}), updatedAt: nowIso() });
  } catch (err) {
    return handleApiError(err);
  }
}
