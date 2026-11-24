import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { ApprovalsClient } from "@/components/approvals-client";
import { PageHeader } from "@/components/ui";

export default async function ApprovalsPage() {
  const ctx = await requirePermission("content.read");
  const approvals = all<{
    id: string;
    post_id: string;
    post_title: string;
    platform: string;
    content_type: string;
    stage: string;
    status: string;
    client_name: string | null;
    reviewer_name: string | null;
    due_at: string | null;
    decided_at: string | null;
    feedback: string | null;
    caption: string | null;
    scheduled_at: string | null;
  }>(
    `SELECT ca.id, ca.post_id, p.title AS post_title, p.platform, p.content_type, ca.stage, ca.status,
            c.name AS client_name, u.full_name AS reviewer_name, ca.due_at, ca.decided_at, ca.feedback, p.caption, p.scheduled_at
       FROM content_approvals ca
       JOIN social_posts p ON p.id = ca.post_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users u ON u.id = ca.reviewer_id
      WHERE ca.workspace_id = ?
      ORDER BY CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END, ca.due_at ASC LIMIT 200`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Brands & team"
        title="Approvals Center"
        description="Multi-stage review with feedback, deadlines and full history. Nothing reaches the publishing queue while a stage is pending."
      />
      <ApprovalsClient initialApprovals={approvals} canApprove={hasPermission(ctx, "content.approve")} />
    </div>
  );
}
