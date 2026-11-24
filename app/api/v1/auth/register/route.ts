import { z } from "zod";
import { created, fail, handleApiError, parseJson, rateLimit, requestIp } from "@/lib/http";
import { createSession } from "@/lib/auth";
import { get, nowIso, run, uid } from "@/lib/db";
import { hashPassword } from "@/lib/password.mjs";
import { logSecurityEvent } from "@/lib/audit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  workspaceName: z.string().min(2).max(80),
});

export async function POST(req: Request) {
  try {
    const ip = requestIp(req);
    if (!rateLimit(`register:${ip}`, 5, 60_000)) return fail("Too many attempts", 429, "rate_limited");
    const body = await parseJson(req, schema);
    const existing = get("SELECT id FROM users WHERE lower(email) = lower(?)", [body.email]);
    if (existing) return fail("An account with that email already exists", 409, "duplicate_email");

    const userId = uid();
    const workspaceId = uid();
    const now = nowIso();
    run(
      `INSERT INTO users (id, email, password_hash, full_name, avatar_color, timezone, locale, is_super_admin,
        notification_prefs, is_active, created_at) VALUES (?,?,?,?,?,?,?,'0',?,1,?)`,
      [
        userId,
        body.email.toLowerCase(),
        hashPassword(body.password),
        body.fullName,
        "#1677FF",
        "UTC",
        "en",
        JSON.stringify({ email: true, inApp: true, browser: false, digest: "weekly" }),
        now,
      ],
    );
    const slug = body.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `workspace-${workspaceId.slice(0, 6)}`;
    run(
      "INSERT INTO workspaces (id, name, slug, owner_id, plan, timezone, logo_color, is_demo, settings_json, created_at) VALUES (?,?,?,?,?,?,?,0,?,?)",
      [workspaceId, body.workspaceName, `${slug}-${workspaceId.slice(0, 4)}`, userId, "agency", "UTC", "#1677FF", "{}", now],
    );
    run(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role_key, status, invited_email, invited_by, client_scope, created_at) VALUES (?,?,?,?,?,NULL,?,NULL,?)",
      [uid(), workspaceId, userId, "workspace_admin", "active", userId, now],
    );
    run("INSERT INTO queue_state (workspace_id, is_paused, paused_by, updated_at) VALUES (?,0,NULL,?)", [workspaceId, now]);

    await createSession(userId, ip, req.headers.get("user-agent") ?? undefined);
    logSecurityEvent(workspaceId, userId, "account_created", "info", "New workspace created", ip);
    logAudit({ user: { id: userId }, workspace: { id: workspaceId } }, "workspace.created", "workspace", workspaceId, {
      name: body.workspaceName,
    });
    return created({ userId, workspaceId });
  } catch (err) {
    return handleApiError(err);
  }
}
