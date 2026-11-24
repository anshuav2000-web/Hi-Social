import { all, get } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { CalendarBoard } from "@/components/calendar-board";
import { PageHeader } from "@/components/ui";

export default async function CalendarPage() {
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
    content_pillar: string | null;
    assigned_writer_id: string | null;
    assigned_designer_id: string | null;
    reviewer_id: string | null;
    media_count: number;
    pending_approvals: number;
  }>(
    `SELECT p.id, p.title, p.status, p.platform, p.content_type, p.client_id, c.name AS client_name, p.campaign_id,
            p.scheduled_at, p.deadline, p.content_pillar, p.assigned_writer_id, p.assigned_designer_id, p.reviewer_id,
            (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.post_id = p.id AND ca.status = 'pending') AS pending_approvals
       FROM social_posts p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.workspace_id = ? AND p.status != 'archived'
      ORDER BY COALESCE(p.scheduled_at, p.deadline, p.created_at) ASC LIMIT 600`,
    [ctx.workspace.id],
  );

  const settings = get<{ settings_json: string }>("SELECT settings_json FROM workspaces WHERE id = ?", [ctx.workspace.id]);
  let holidays: string[] = [];
  try {
    holidays = (JSON.parse(settings?.settings_json ?? "{}").holidays as string[]) ?? [];
  } catch {
    holidays = [];
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operate"
        title="Social Media Calendar"
        description="The central planning workspace: scheduled and unscheduled content, campaigns, deadlines and approvals in one grid. Drag a card onto a date to reschedule."
      />
      <CalendarBoard
        initialPosts={posts}
        lookups={workspaceLookups(ctx.workspace.id)}
        canWrite={hasPermission(ctx, "content.write")}
        canPublish={hasPermission(ctx, "content.publish")}
        holidays={holidays}
      />
    </div>
  );
}
