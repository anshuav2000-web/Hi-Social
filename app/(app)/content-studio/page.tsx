import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { PostStudio } from "@/components/post-studio";
import { PageHeader, DemoDataNotice } from "@/components/ui";

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("content.read");
  const params = await searchParams;

  const posts = all<{
    id: string;
    title: string;
    status: string;
    platform: string;
    content_type: string;
    client_name: string | null;
    scheduled_at: string | null;
    updated_at: string;
    pending_approvals: number;
    media_count: number;
    publish_channel: string | null;
  }>(
    `SELECT p.id, p.title, p.status, p.platform, p.content_type, c.name AS client_name, p.scheduled_at, p.updated_at,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.post_id = p.id AND ca.status = 'pending') AS pending_approvals,
            (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
            (SELECT channel FROM published_posts pp WHERE pp.post_id = p.id ORDER BY published_at DESC LIMIT 1) AS publish_channel
       FROM social_posts p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.workspace_id = ? AND p.status != 'archived'
      ORDER BY p.updated_at DESC LIMIT 200`,
    [ctx.workspace.id],
  );

  const media = all<{ id: string; name: string; url: string | null; mime_type: string; kind: string; width: number | null; height: number | null }>(
    "SELECT id, name, url, mime_type, kind, width, height FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200",
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operate"
        title="Content Studio"
        description="Write, brief, attach creative and preview every format. Autosave keeps a version per edit; approvals gate publishing."
      />
      <DemoDataNotice isDemo={ctx.workspace.is_demo === 1} />
      <PostStudio
        initialPosts={posts}
        lookups={workspaceLookups(ctx.workspace.id)}
        media={media}
        canWrite={hasPermission(ctx, "content.write")}
        canPublish={hasPermission(ctx, "content.publish")}
        canApprove={hasPermission(ctx, "content.approve")}
        initialPostId={params.post}
        initialNew={params.new === "1"}
        initialCampaign={params.campaign}
      />
    </div>
  );
}
