import { all } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { ResourceManager } from "@/components/resource-manager";
import { Banner, Card, PageHeader, SectionHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function CompetitorResearchPage() {
  const ctx = await requirePermission("analytics.read");
  const lookups = workspaceLookups(ctx.workspace.id);
  const canWrite = hasPermission(ctx, "content.write");

  const competitors = all<{ id: string; name: string; platform: string | null; handle: string | null; notes: string | null; client_name: string | null }>(
    `SELECT cp.id, cp.name, cp.platform, cp.handle, cp.notes, c.name AS client_name
       FROM competitor_profiles cp LEFT JOIN clients c ON c.id = cp.client_id
      WHERE cp.workspace_id = ? ORDER BY cp.name`,
    [ctx.workspace.id],
  );

  const references = all<{ id: string; title: string; platform: string | null; tags: string | null; notes: string | null; saved_at: string; competitor_name: string | null; url: string | null }>(
    `SELECT cr.*, cp.name AS competitor_name FROM competitor_references cr
       LEFT JOIN competitor_profiles cp ON cp.id = cr.competitor_id
      WHERE cr.workspace_id = ? ORDER BY cr.saved_at DESC LIMIT 30`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Competitor Research"
        description="A manual research workspace: competitor profiles, saved public references, hashtag collections and trend notes. No private analytics, no scraping, no platform restriction bypass."
      />

      <Banner tone="warning" title="Public references only">
        SocialHub Pro never scrapes private metrics, automates logins or bypasses rate limits. Add public post URLs and your own
        notes; benchmark manually against your own numbers in Analytics.
      </Banner>

      <div className="grid gap-4 xl:grid-cols-2">
        <ResourceManager resourceKey="competitors" lookups={lookups} canWrite={canWrite} />
        <ResourceManager resourceKey="references" lookups={lookups} canWrite={canWrite} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Competitor board" description="Profiles tracked for this workspace." />
          <div className="mt-3 space-y-2">
            {competitors.length === 0 && <p className="text-[12px] text-[var(--muted)]">No competitors added yet.</p>}
            {competitors.map((competitor) => (
              <div key={competitor.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-medium">{competitor.name}</p>
                  <span className="text-[10.5px] text-[var(--muted)]">{competitor.handle ?? "—"}</span>
                </div>
                <p className="text-[10.5px] text-[var(--muted)]">
                  {competitor.platform ?? "platform n/a"} · {competitor.client_name ?? "all clients"}
                </p>
                {competitor.notes && <p className="mt-1 text-[11.5px] text-[var(--muted)]">{competitor.notes}</p>}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Inspiration library" description="Saved public posts and creative references." actions={<a href="/hashtag-manager" className="text-[11px] text-[var(--accent)]">Hashtag sets</a>} />
          <div className="mt-3 space-y-2">
            {references.length === 0 && <p className="text-[12px] text-[var(--muted)]">Nothing saved yet.</p>}
            {references.map((reference) => (
              <div key={reference.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-medium">{reference.title}</p>
                  <span className="text-[10.5px] text-[var(--muted)]">{formatDate(reference.saved_at)}</span>
                </div>
                <p className="text-[10.5px] text-[var(--muted)]">
                  {reference.competitor_name ?? "Unassigned"} · {reference.platform ?? "—"}
                </p>
                {reference.notes && <p className="mt-1 text-[11.5px] text-[var(--muted)]">{reference.notes}</p>}
                {reference.url && (
                  <a href={reference.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[11px] text-[var(--accent)] hover:underline">
                    Open public post →
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
