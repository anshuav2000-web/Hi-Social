import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { PlannerBoard } from "@/components/planner-board";
import { PageHeader } from "@/components/ui";

export default async function PostPlannerPage() {
  const ctx = await requirePermission("content.read");
  const posts = all<{
    id: string;
    title: string;
    status: string;
    platform: string;
    content_type: string;
    client_id: string | null;
    client_name: string | null;
    campaign_id: string | null;
    scheduled_at: string | null;
    deadline: string | null;
    priority: string;
    writer_name: string | null;
    designer_name: string | null;
    reviewer_name: string | null;
    media_count: number;
    pending_approvals: number;
    approval_total: number;
    comment_count: number;
  }>(
    `SELECT p.id, p.title, p.status, p.platform, p.content_type, p.client_id, c.name AS client_name, p.campaign_id,
            p.scheduled_at, p.deadline, p.priority,
            w.full_name AS writer_name, d.full_name AS designer_name, r.full_name AS reviewer_name,
            (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.post_id = p.id AND ca.status = 'pending') AS pending_approvals,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.post_id = p.id) AS approval_total,
            (SELECT COUNT(*) FROM content_comments cc WHERE cc.post_id = p.id) AS comment_count
       FROM social_posts p LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users w ON w.id = p.assigned_writer_id LEFT JOIN users d ON d.id = p.assigned_designer_id
       LEFT JOIN users r ON r.id = p.reviewer_id
      WHERE p.workspace_id = ? AND p.status != 'archived'
      ORDER BY COALESCE(p.scheduled_at, p.deadline, p.created_at) ASC LIMIT 400`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operate"
        title="Post Planner"
        description="Kanban, table and timeline views over the full production pipeline. Drag a card to change status — invalid transitions are rejected by the server."
      />
      <PlannerBoard initialPosts={posts} canWrite={hasPermission(ctx, "content.write")} />
    </div>
  );
}
