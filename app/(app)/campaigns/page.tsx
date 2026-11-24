import Link from "next/link";
import { all, get } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { ResourceManager } from "@/components/resource-manager";
import { Badge, Card, EmptyState, PageHeader, Progress, SectionHeader } from "@/components/ui";
import { formatDate, formatNumber, label } from "@/lib/utils";

export default async function CampaignsPage() {
  const ctx = await requirePermission("content.read");
  const lookups = workspaceLookups(ctx.workspace.id);

  const campaigns = all<{
    id: string;
    name: string;
    client_name: string | null;
    objective: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    posts: number;
    published: number;
    reach: number | null;
    engagement: number | null;
  }>(
    `SELECT cmp.id, cmp.name, c.name AS client_name, cmp.objective, cmp.status, cmp.start_date, cmp.end_date,
            (SELECT COUNT(*) FROM campaign_posts cp WHERE cp.campaign_id = cmp.id) AS posts,
            (SELECT COUNT(*) FROM social_posts p WHERE p.campaign_id = cmp.id AND p.status = 'published') AS published,
            (SELECT SUM(m.reach) FROM social_posts p JOIN post_metrics m ON m.post_id = p.id WHERE p.campaign_id = cmp.id) AS reach,
            (SELECT SUM(m.engagement) FROM social_posts p JOIN post_metrics m ON m.post_id = p.id WHERE p.campaign_id = cmp.id) AS engagement
       FROM campaigns cmp LEFT JOIN clients c ON c.id = cmp.client_id
      WHERE cmp.workspace_id = ? ORDER BY cmp.created_at DESC`,
    [ctx.workspace.id],
  );

  const totals = get<{ n: number }>("SELECT COUNT(*) AS n FROM campaigns WHERE workspace_id = ?", [ctx.workspace.id]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Brands & team"
        title="Campaign Manager"
        description="Objectives, deliverables, flight dates and live performance per campaign. Measurements come from post_metrics attached to the campaign's posts."
      />

      <ResourceManager resourceKey="campaigns" lookups={lookups} canWrite={hasPermission(ctx, "content.write")} />

      <Card>
        <SectionHeader
          title="Campaign performance"
          description={`${totals?.n ?? 0} campaigns in this workspace. Reach and engagement only count posts that have metric rows.`}
        />
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns" description="Create a campaign above, then attach posts from the Content Studio." />
        ) : (
          <div className="mt-3 space-y-2">
            {campaigns.map((campaign) => {
              const maxReach = Math.max(...campaigns.map((c) => c.reach ?? 0), 1);
              return (
                <div key={campaign.id} className="rounded-xl border border-[var(--line)] bg-[var(--card-2)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{campaign.name}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {campaign.client_name ?? "No client"} · {label(campaign.objective ?? "objective not set")} ·{" "}
                        {formatDate(campaign.start_date)} → {formatDate(campaign.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={campaign.status} />
                      <span className="text-[11px] text-[var(--muted)]">
                        {campaign.published}/{campaign.posts} published
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Progress value={((campaign.reach ?? 0) / maxReach) * 100} />
                    <span className="text-[11px] text-[var(--muted)]">
                      {formatNumber(campaign.reach)} reach · {formatNumber(campaign.engagement)} engagement
                    </span>
                  </div>
                  <Link href={`/content-studio?campaign=${campaign.id}`} className="mt-2 inline-block text-[11px] text-[var(--accent)] hover:underline">
                    Open campaign content →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
