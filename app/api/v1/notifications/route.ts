import { z } from "zod";
import { all, get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, parseJson } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  try {
    const ctx = await guard("workspace.read");
    const limit = Math.min(100, Number(new URL(req.url).searchParams.get("limit") || 30) || 30);
    const rows = all(
      `SELECT * FROM notifications WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL)
        ORDER BY created_at DESC LIMIT ?`,
      [ctx.workspace.id, ctx.user.id, limit],
    );
    const unread = get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL) AND is_read = 0",
      [ctx.workspace.id, ctx.user.id],
    );
    let prefs: Record<string, unknown> = {};
    try {
      prefs = JSON.parse(ctx.user.notification_prefs || "{}");
    } catch {
      prefs = {};
    }
    return ok({
      rows,
      unread: unread?.n ?? 0,
      preferences: prefs,
      emailConfigured: Boolean(env.smtpUrl),
      channels: {
        inApp: true,
        email: Boolean(env.smtpUrl),
        browser: false,
      },
      notes: env.smtpUrl
        ? "Email delivery is configured."
        : "Email and browser push are not configured on this deployment (SMTP_URL unset). In-app notifications are always delivered.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  action: z.enum(["read", "read_all", "prefs"]),
  ids: z.array(z.string()).optional(),
  preferences: z
    .object({ email: z.boolean().optional(), inApp: z.boolean().optional(), browser: z.boolean().optional(), digest: z.enum(["daily", "weekly", "off"]).optional() })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("workspace.read");
    const body = await parseJson(req, schema);
    if (body.action === "read" && body.ids?.length) {
      for (const id of body.ids) {
        run("UPDATE notifications SET is_read = 1 WHERE id = ? AND workspace_id = ? AND (user_id = ? OR user_id IS NULL)", [
          id,
          ctx.workspace.id,
          ctx.user.id,
        ]);
      }
    } else if (body.action === "read_all") {
      run("UPDATE notifications SET is_read = 1 WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL)", [
        ctx.workspace.id,
        ctx.user.id,
      ]);
    } else if (body.action === "prefs" && body.preferences) {
      run("UPDATE users SET notification_prefs = ? WHERE id = ?", [JSON.stringify(body.preferences), ctx.user.id]);
    }
    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
