import { z } from "zod";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { ACTIONS, TRIGGERS, runAutomations } from "@/lib/automations";
import { workspaceAdmins } from "@/lib/notifications";

export async function GET() {
  try {
    const ctx = await guard("automation.manage");
    const automations = all(
      "SELECT * FROM automations WHERE workspace_id = ? ORDER BY created_at DESC",
      [ctx.workspace.id],
    );
    const runs = all(
      `SELECT ar.*, a.name AS automation_name FROM automation_runs ar JOIN automations a ON a.id = ar.automation_id
        WHERE ar.workspace_id = ? ORDER BY ar.created_at DESC LIMIT 40`,
      [ctx.workspace.id],
    );
    const members = all<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN workspace_members wm ON wm.user_id = u.id WHERE wm.workspace_id = ?`,
      [ctx.workspace.id],
    );
    return ok({ automations, runs, triggers: TRIGGERS, actions: ACTIONS, members });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  action: z.enum(["create", "update", "toggle", "delete", "test"]),
  id: z.string().optional(),
  name: z.string().max(160).optional(),
  trigger: z.string().optional(),
  conditions: z.array(z.object({ field: z.string(), op: z.string(), value: z.string().optional() })).optional(),
  actions: z
    .array(
      z.object({
        type: z.string(),
        target: z.string().optional(),
        message: z.string().optional(),
        title: z.string().optional(),
        status: z.string().optional(),
        stage: z.string().optional(),
      }),
    )
    .optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("automation.manage");
    const body = await parseJson(req, schema);

    if (body.action === "create") {
      if (!body.name?.trim()) throw new ApiError("Name is required", 422, "missing_name");
      if (!body.trigger || !TRIGGERS.some((t) => t.key === body.trigger)) throw new ApiError("Unknown trigger", 422, "invalid_trigger");
      if (!body.actions?.length) throw new ApiError("At least one action is required", 422, "missing_actions");
      const id = uid();
      run(
        `INSERT INTO automations (id, workspace_id, name, trigger_key, conditions_json, actions_json, is_enabled, last_run_at, run_count, created_by, created_at)
         VALUES (?,?,?,?,?,?,1,NULL,0,?,?)`,
        [
          id,
          ctx.workspace.id,
          body.name,
          body.trigger,
          JSON.stringify(body.conditions ?? []),
          JSON.stringify(body.actions),
          ctx.user.id,
          nowIso(),
        ],
      );
      logAudit(ctx, "automation.created", "automation", id, { name: body.name, trigger: body.trigger }, requestIp(req));
      return ok({ id });
    }

    if (!body.id) throw new ApiError("id is required", 422, "missing_id");
    const existing = get<{ id: string; is_enabled: number; trigger_key: string }>(
      "SELECT * FROM automations WHERE id = ? AND workspace_id = ?",
      [body.id, ctx.workspace.id],
    );
    if (!existing) throw new ApiError("Automation not found", 404, "not_found");

    if (body.action === "update") {
      run(
        `UPDATE automations SET name = COALESCE(?, name), trigger_key = COALESCE(?, trigger_key),
           conditions_json = COALESCE(?, conditions_json), actions_json = COALESCE(?, actions_json) WHERE id = ?`,
        [
          body.name ?? null,
          body.trigger ?? null,
          body.conditions ? JSON.stringify(body.conditions) : null,
          body.actions ? JSON.stringify(body.actions) : null,
          body.id,
        ],
      );
    } else if (body.action === "toggle") {
      run("UPDATE automations SET is_enabled = ? WHERE id = ?", [existing.is_enabled ? 0 : 1, body.id]);
    } else if (body.action === "delete") {
      run("DELETE FROM automations WHERE id = ?", [body.id]);
    } else if (body.action === "test") {
      runAutomations(ctx.workspace.id, existing.trigger_key, { __depth: 0, test: true });
      const lastRun = get("SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 1", [body.id]);
      return ok({ tested: true, lastRun });
    }
    logAudit(ctx, `automation.${body.action}`, "automation", body.id, {}, requestIp(req));
    return ok({ id: body.id, action: body.action, admins: workspaceAdmins(ctx.workspace.id).length });
  } catch (err) {
    return handleApiError(err);
  }
}
