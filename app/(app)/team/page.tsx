import { all } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import { TeamClient } from "@/components/team-client";
import { PageHeader } from "@/components/ui";

export default async function TeamPage() {
  const ctx = await requirePermission("workspace.read");
  const members = all<{
    id: string;
    user_id: string | null;
    role_key: string;
    status: string;
    invited_email: string | null;
    client_scope: string | null;
    full_name: string | null;
    email: string | null;
    avatar_color: string | null;
    job_title: string | null;
    last_login_at: string | null;
    open_tasks: number;
    pending_reviews: number;
  }>(
    `SELECT wm.id, wm.user_id, wm.role_key, wm.status, wm.invited_email, wm.client_scope,
            u.full_name, u.email, u.avatar_color, u.job_title, u.last_login_at,
            (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = wm.user_id AND t.workspace_id = wm.workspace_id AND t.status != 'done') AS open_tasks,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.reviewer_id = wm.user_id AND ca.status = 'pending') AS pending_reviews
       FROM workspace_members wm LEFT JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY CASE wm.role_key WHEN 'workspace_admin' THEN 0 WHEN 'social_media_manager' THEN 1 ELSE 2 END, u.full_name`,
    [ctx.workspace.id],
  );

  const clients = all<{ id: string; name: string }>("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]);
  const canManage = ctx.user.is_super_admin === 1 || ctx.workspace.role_key === "workspace_admin";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Brands & team"
        title="Team Management"
        description="Roles, permissions, brand scoping and workload. Brand viewers only see the brands assigned to them."
      />
      <TeamClient
        initialMembers={members}
        roles={ROLES.map((key) => ({ key, label: ROLE_LABELS[key] }))}
        clients={clients}
        canManage={canManage}
      />
    </div>
  );
}
