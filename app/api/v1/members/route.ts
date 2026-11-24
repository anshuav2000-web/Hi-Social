import { z } from "zod";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ROLES, ROLE_LABELS, isRole } from "@/lib/rbac";

export async function GET() {
  try {
    const ctx = await guard("workspace.read");
    const members = all(
      `SELECT wm.id, wm.user_id, wm.role_key, wm.status, wm.invited_email, wm.client_scope, wm.created_at,
              u.full_name, u.email, u.avatar_color, u.job_title, u.last_login_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = wm.user_id AND t.workspace_id = wm.workspace_id AND t.status != 'done') AS open_tasks,
              (SELECT COUNT(*) FROM content_approvals ca WHERE ca.reviewer_id = wm.user_id AND ca.status = 'pending') AS pending_reviews
         FROM workspace_members wm LEFT JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ? ORDER BY
          CASE wm.role_key WHEN 'workspace_admin' THEN 0 WHEN 'social_media_manager' THEN 1 ELSE 2 END, u.full_name`,
      [ctx.workspace.id],
    );
    return ok({
      members,
      roles: ROLES.map((key) => ({ key, label: ROLE_LABELS[key] })),
      invitee: { canManage: ctx.user.is_super_admin === 1 || ctx.workspace.role_key === "workspace_admin" },
      clients: all("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120).optional(),
  roleKey: z.string(),
  clientScope: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("workspace.manage");
    if (ctx.workspace.role_key !== "workspace_admin" && ctx.user.is_super_admin !== 1) {
      throw new ApiError("Only workspace admins can invite members", 403, "forbidden");
    }
    const body = await parseJson(req, inviteSchema);
    if (!isRole(body.roleKey)) throw new ApiError("Unknown role", 422, "invalid_role");
    if (body.roleKey === "super_admin") throw new ApiError("Super admin is assigned per user, not by invitation", 422, "invalid_role");

    const existingUser = get<{ id: string; full_name: string }>("SELECT id, full_name FROM users WHERE lower(email) = lower(?)", [body.email]);
    const alreadyMember = existingUser
      ? get<{ id: string }>("SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [ctx.workspace.id, existingUser.id])
      : null;
    if (alreadyMember) throw new ApiError("That person is already a member of this workspace", 409, "already_member");

    const now = nowIso();
    const memberId = uid();
    run(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role_key, status, invited_email, invited_by, client_scope, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        memberId,
        ctx.workspace.id,
        existingUser?.id ?? null,
        body.roleKey,
        existingUser ? "active" : "invited",
        body.email.toLowerCase(),
        ctx.user.id,
        body.clientScope ?? null,
        now,
      ],
    );
    if (existingUser) {
      notify({
        workspaceId: ctx.workspace.id,
        userId: existingUser.id,
        kind: "member_added",
        title: "You were added to a workspace",
        body: `${ctx.user.full_name} added you as ${ROLE_LABELS[body.roleKey]}.`,
        link: "/dashboard",
      });
    }
    logAudit(ctx, "member.invited", "workspace_member", memberId, { email: body.email, role: body.roleKey }, requestIp(req));
    return ok({
      memberId,
      linkedUser: Boolean(existingUser),
      note: existingUser
        ? "Existing account linked — the member can sign in immediately."
        : "Invitation recorded. This deployment has no SMTP configured, so share the registration link with them manually: they must sign up with this exact email.",
      emailDelivery: Boolean(process.env.SMTP_URL),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  memberId: z.string().min(3),
  roleKey: z.string().optional(),
  status: z.enum(["active", "invited", "suspended"]).optional(),
  clientScope: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const ctx = await guard("workspace.manage");
    if (ctx.workspace.role_key !== "workspace_admin" && ctx.user.is_super_admin !== 1) {
      throw new ApiError("Only workspace admins can change members", 403, "forbidden");
    }
    const body = await parseJson(req, patchSchema);
    const member = get<{ id: string; user_id: string | null; role_key: string }>(
      "SELECT id, user_id, role_key FROM workspace_members WHERE id = ? AND workspace_id = ?",
      [body.memberId, ctx.workspace.id],
    );
    if (!member) throw new ApiError("Member not found", 404, "not_found");
    if (member.user_id === ctx.user.id && body.roleKey && body.roleKey !== member.role_key) {
      throw new ApiError("You cannot change your own role", 422, "self_role_change");
    }
    if (body.roleKey) {
      if (!isRole(body.roleKey) || body.roleKey === "super_admin") throw new ApiError("Unknown role", 422, "invalid_role");
      run("UPDATE workspace_members SET role_key = ? WHERE id = ?", [body.roleKey, member.id]);
    }
    if (body.status) run("UPDATE workspace_members SET status = ? WHERE id = ?", [body.status, member.id]);
    if (body.clientScope !== undefined) run("UPDATE workspace_members SET client_scope = ? WHERE id = ?", [body.clientScope, member.id]);
    logAudit(ctx, "member.updated", "workspace_member", member.id, body, requestIp(req));
    return ok({ id: member.id });
  } catch (err) {
    return handleApiError(err);
  }
}
