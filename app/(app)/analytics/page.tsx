import Link from "next/link";
import { all, get } from "@/lib/db";
import { clientScopeFor, requirePermission } from "@/lib/auth";
import {
  accountKpis,
  accountPerformance,
  bestPostingTimes,
  contentTypePerformance,
  dailyTrend,
  dataSourcesNote,
  parseRange,
  platformBreakdown,
  topPosts,
} from "@/lib/analytics";
import { buildInsights } from "@/lib/insights";
import { formatDate, formatNumber, formatPercent, label, pctChange } from "@/lib/utils";
import { Badge, Banner, Card, EmptyState, PageHeader, PlatformDot, SectionHeader, StatCard, Progress } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { HorizontalBars, SharePie, TrendChart } from "@/components/charts";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("analytics.read");
  const params = await searchParams;
  const range = parseRange(new URLSearchParams(params as Record<string, string>), 30);
  const scoped = await clientScopeFor(ctx);

  const prevEnd = new Date(new Date(range.from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevStart = new Date(new Date(range.from).getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const kpis = accountKpis(ctx.workspace.id, range, scoped);
  const prev = accountKpis(ctx.workspace.id, { from: prevStart, to: prevEnd }, scoped);
  const trend = dailyTrend(ctx.workspace.id, range, scoped);
  const platforms = platformBreakdown(ctx.workspace.id, range);
  const types = contentTypePerformance(ctx.workspace.id, range);
  const accounts = accountPerformance(ctx.workspace.id, range);
  const best = bestPostingTimes(ctx.workspace.id).slice(0, 8);
  const top = topPosts(ctx.workspace.id, range, 5);
  const bottom = topPosts(ctx.workspace.id, range, 5, true);
  const insights = buildInsights(ctx.workspace.id, range);

  const dailyLimit = get<{ n: number }>(
    "SELECT COUNT(DISTINCT captured_on) AS n FROM account_metrics WHERE workspace_id = ?",
    [ctx.workspace.id],
  );
  const earliest = get<{ d: string | null }>(
    "SELECT MIN(captured_on) AS d FROM account_metrics WHERE workspace_id = ?",
    [ctx.workspace.id],
  );
  const lastSync = get<{ at: string | null }>(
    "SELECT MAX(last_synced_at) AS at FROM social_accounts WHERE workspace_id = ?",
    [ctx.workspace.id],
  );
  const isDemoData = kpis.sources.includes("demo");
  const isMetaData = kpis.sources.includes("meta");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics Center"
        description={`Instagram and Facebook performance for ${range.from} → ${range.to}. Metrics a platform does not report stay null, never zero.`}
        actions={<RangePicker basePath="/analytics" />}
      />

      <Banner tone={isDemoData ? "warning" : "info"} title="Data provenance">
        {dataSourcesNote(kpis.sources)} Retention: {dailyLimit?.n ?? 0} daily snapshots from {formatDate(earliest?.d)} · last
        account sync {lastSync?.at ? formatDate(lastSync.at) : "never"}. Engagement rate is always engagement ÷ reach, so
        denominators are platform-specific.
      </Banner>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reach" value={formatNumber(kpis.reach)} delta={pctChange(kpis.reach, prev.reach)} hint="vs previous period" />
        <StatCard label="Impressions" value={formatNumber(kpis.impressions)} delta={pctChange(kpis.impressions, prev.impressions)} hint="vs previous period" />
        <StatCard label="Engagement" value={formatNumber(kpis.engagement)} delta={pctChange(kpis.engagement, prev.engagement)} hint="likes+comments+shares+saves" />
        <StatCard label="Engagement rate" value={formatPercent(kpis.engagementRate)} delta={pctChange(kpis.engagementRate, prev.engagementRate)} hint="engagement ÷ reach" />
        <StatCard label="Followers" value={formatNumber(kpis.followers)} hint="latest snapshot ≤ period end" />
        <StatCard label="Follower growth" value={formatNumber(kpis.followerGrowth)} hint="sum of daily growth" />
        <StatCard label="Published" value={String(kpis.publishedPosts)} hint="in period" />
        <StatCard label="Scheduled" value={String(kpis.scheduledPosts)} hint="in period" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionHeader
            title="Reach, impressions and engagement"
            description="Daily totals. Days without rows are omitted rather than zero-filled."
            actions={<Badge status={isMetaData ? "published" : "draft"}>{isMetaData ? "Meta API" : isDemoData ? "Demo dataset" : "No data"}</Badge>}
          />
          <div className="mt-3">
            <TrendChart
              data={trend as unknown as Array<Record<string, string | number | null>>}
              series={[
                { key: "reach", label: "Reach", color: "#1677FF" },
                { key: "impressions", label: "Impressions", color: "#35A7FF" },
                { key: "engagement", label: "Engagement", color: "#8B5CF6" },
              ]}
              height={260}
            />
          </div>
        </Card>
        <Card>
          <SectionHeader title="Platform split" description="Instagram vs Facebook reach." />
          <div className="mt-2">
            <SharePie data={platforms.map((p) => ({ name: label(p.platform), value: p.reach ?? 0 }))} colors={["#E1306C", "#1877F2", "#0A66C2"]} />
          </div>
          <div className="mt-2 space-y-1">
            {platforms.map((platform) => (
              <div key={platform.platform} className="flex items-center justify-between text-[11.5px]">
                <PlatformDot platform={platform.platform} />
                <span className="text-[var(--muted)]">
                  {formatNumber(platform.impressions)} impressions · {formatNumber(platform.engagement)} eng
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionHeader title="Content type performance" description="Engagement by format." />
          <div className="mt-2">
            <HorizontalBars data={types.map((t) => ({ name: label(t.content_type), value: t.engagement ?? 0 }))} />
          </div>
          <div className="mt-2 space-y-1">
            {types.map((type) => (
              <div key={type.content_type} className="flex items-center justify-between text-[11px]">
                <span>{label(type.content_type)}</span>
                <span className="text-[var(--muted)]">{type.posts} posts · {formatPercent(type.engagement_rate)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Best posting windows" description="Observed averages from published posts." />
          <div className="mt-2 space-y-1">
            {best.length === 0 && <p className="text-[12px] text-[var(--muted)]">Not enough published posts with metrics.</p>}
            {best.map((slot) => (
              <div key={`${slot.dow}-${slot.hour}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2 py-1 text-[11px]">
                <span>{DOW[slot.dow]} {String(slot.hour).padStart(2, "0")}:00</span>
                <span className="text-[var(--muted)]">{formatPercent(slot.avg_rate)} · {slot.posts}p</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            This is correlation in your own data, not a guarantee. Test one change at a time.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Account performance" description="Per connected account, this period." />
          <div className="mt-2 space-y-2">
            {accounts.map((account) => {
              const maxReach = Math.max(...accounts.map((a) => a.reach ?? 0), 1);
              return (
                <div key={account.id}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="truncate">{account.name}</span>
                    <span className="text-[var(--muted)]">{formatNumber(account.reach)} reach</span>
                  </div>
                  <Progress value={((account.reach ?? 0) / maxReach) * 100} />
                  <p className="mt-0.5 text-[9.5px] text-[var(--muted)]">
                    {label(account.platform)} · {formatNumber(account.followers)} followers · {formatPercent(account.engagement_rate)} ER ·{" "}
                    {account.status === "connected" ? "live" : "sandbox"}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13.5px] font-semibold">Top performing content</p>
            <p className="text-[11px] text-[var(--muted)]">Ranked by total engagement across all metric snapshots in the period.</p>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr>{["Post", "Platform", "Type", "Reach", "Engagement", "Rate"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {top.map((post) => (
                  <tr key={post.id}>
                    <td><Link href={`/content-studio?post=${post.id}`} className="hover:underline">{post.title}</Link></td>
                    <td><PlatformDot platform={post.platform} /></td>
                    <td className="text-[var(--muted)]">{label(post.content_type)}</td>
                    <td>{formatNumber(post.reach)}</td>
                    <td>{formatNumber(post.engagement)}</td>
                    <td className="text-emerald-400">{formatPercent(post.engagement_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {top.length === 0 && <EmptyState title="No post metrics yet" description="Published posts gain metrics when a sync runs or demo data is seeded." />}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13.5px] font-semibold">Underperforming content</p>
            <p className="text-[11px] text-[var(--muted)]">Lowest engagement — candidates for repurposing or retiring.</p>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr>{["Post", "Platform", "Type", "Reach", "Engagement", "Rate"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {bottom.map((post) => (
                  <tr key={post.id}>
                    <td><Link href={`/content-studio?post=${post.id}`} className="hover:underline">{post.title}</Link></td>
                    <td><PlatformDot platform={post.platform} /></td>
                    <td className="text-[var(--muted)]">{label(post.content_type)}</td>
                    <td>{formatNumber(post.reach)}</td>
                    <td>{formatNumber(post.engagement)}</td>
                    <td className="text-amber-400">{formatPercent(post.engagement_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bottom.length === 0 && <EmptyState title="Nothing to flag" description="No post metrics in this period." />}
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Recommendations with evidence"
          description="Facts and hypotheses are labelled separately. Each item states its period and source."
          actions={<Link href="/ai-assistant" className="btn btn-sm">Open AI assistant</Link>}
        />
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {insights.map((insight) => (
            <div key={insight.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium leading-snug">{insight.title}</p>
                <Badge status={insight.kind === "fact" ? "approved" : "review"}>{insight.kind}</Badge>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">{insight.body}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Source: {insight.source} · {insight.period}</p>
            </div>
          ))}
          {insights.length === 0 && <p className="text-[12px] text-[var(--muted)]">No insights available — publish content and sync metrics first.</p>}
        </div>
      </Card>
    </div>
  );
}
