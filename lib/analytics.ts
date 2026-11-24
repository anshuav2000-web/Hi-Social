import "server-only";
import { all, get } from "@/lib/db";

export type Range = { from: string; to: string };

export function parseRange(searchParams: URLSearchParams, defaultDays = 30): Range {
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from =
    searchParams.get("from") ||
    new Date(Date.now() - defaultDays * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export type KpiSet = {
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  engagementRate: number | null;
  followers: number | null;
  followerGrowth: number | null;
  publishedPosts: number;
  scheduledPosts: number;
  pendingApprovals: number;
  failedPublications: number;
  sources: string[];
};

/**
 * Account-level aggregates from account_metrics. Metrics that the platform does
 * not report stay null (never coerced to 0).
 */
export function accountKpis(workspaceId: string, range: Range, clientIds?: string[] | null): KpiSet {
  const clientFilter = clientIds && clientIds.length
    ? `AND sa.client_id IN (${clientIds.map(() => "?").join(",")})`
    : "";
  const params: unknown[] = [workspaceId, range.from, range.to, ...(clientIds && clientIds.length ? clientIds : [])];

  const agg = get<{
    reach: number | null;
    impressions: number | null;
    engagement: number | null;
    growth: number | null;
  }>(
    `SELECT SUM(am.reach) AS reach, SUM(am.impressions) AS impressions,
            SUM(am.engagement) AS engagement, SUM(am.follower_growth) AS growth
       FROM account_metrics am
       JOIN social_accounts sa ON sa.id = am.social_account_id
      WHERE am.workspace_id = ? AND am.captured_on BETWEEN ? AND ? ${clientFilter}`,
    params,
  );

  const latestFollowers = get<{ followers: number | null }>(
    `SELECT SUM(am.followers) AS followers FROM account_metrics am
       JOIN social_accounts sa ON sa.id = am.social_account_id
      WHERE am.workspace_id = ? AND am.captured_on = (
        SELECT MAX(captured_on) FROM account_metrics WHERE workspace_id = ? AND captured_on <= ?
      ) ${clientFilter}`,
    [workspaceId, workspaceId, range.to, ...(clientIds && clientIds.length ? clientIds : [])],
  );

  const published = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM social_posts WHERE workspace_id = ? AND status = 'published'
       AND published_at BETWEEN ? AND ? ${clientIds && clientIds.length ? `AND client_id IN (${clientIds.map(() => "?").join(",")})` : ""}`,
    [workspaceId, `${range.from}T00:00:00.000Z`, `${range.to}T23:59:59.999Z`, ...(clientIds && clientIds.length ? clientIds : [])],
  );
  const scheduled = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM social_posts WHERE workspace_id = ? AND status IN ('scheduled','approved')
       AND scheduled_at BETWEEN ? AND ? ${clientIds && clientIds.length ? `AND client_id IN (${clientIds.map(() => "?").join(",")})` : ""}`,
    [workspaceId, `${range.from}T00:00:00.000Z`, `${range.to}T23:59:59.999Z`, ...(clientIds && clientIds.length ? clientIds : [])],
  );
  const approvals = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM content_approvals WHERE workspace_id = ? AND status = 'pending'`,
    [workspaceId],
  );
  const failed = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status IN ('failed','dead')`,
    [workspaceId],
  );
  const sources = all<{ source: string }>(
    `SELECT DISTINCT source FROM account_metrics WHERE workspace_id = ? AND captured_on BETWEEN ? AND ?`,
    [workspaceId, range.from, range.to],
  ).map((r) => r.source);

  const engagement = agg?.engagement ?? null;
  const reach = agg?.reach ?? null;
  return {
    reach,
    impressions: agg?.impressions ?? null,
    engagement,
    engagementRate: reach && engagement !== null ? Number(((engagement / reach) * 100).toFixed(2)) : null,
    followers: latestFollowers?.followers ?? null,
    followerGrowth: agg?.growth ?? null,
    publishedPosts: published?.n ?? 0,
    scheduledPosts: scheduled?.n ?? 0,
    pendingApprovals: approvals?.n ?? 0,
    failedPublications: failed?.n ?? 0,
    sources,
  };
}

export type TrendRow = { date: string; reach: number | null; impressions: number | null; engagement: number | null; followers: number | null };

export function dailyTrend(workspaceId: string, range: Range, clientIds?: string[] | null): TrendRow[] {
  const clientFilter = clientIds && clientIds.length ? `AND sa.client_id IN (${clientIds.map(() => "?").join(",")})` : "";
  return all<TrendRow>(
    `SELECT am.captured_on AS date, SUM(am.reach) AS reach, SUM(am.impressions) AS impressions,
            SUM(am.engagement) AS engagement, SUM(am.followers) AS followers
       FROM account_metrics am
       JOIN social_accounts sa ON sa.id = am.social_account_id
      WHERE am.workspace_id = ? AND am.captured_on BETWEEN ? AND ? ${clientFilter}
      GROUP BY am.captured_on ORDER BY am.captured_on ASC`,
    [workspaceId, range.from, range.to, ...(clientIds && clientIds.length ? clientIds : [])],
  );
}

export function platformBreakdown(workspaceId: string, range: Range) {
  return all<{ platform: string; reach: number | null; engagement: number | null; impressions: number | null }>(
    `SELECT platform, SUM(reach) AS reach, SUM(engagement) AS engagement, SUM(impressions) AS impressions
       FROM account_metrics WHERE workspace_id = ? AND captured_on BETWEEN ? AND ?
      GROUP BY platform ORDER BY reach DESC`,
    [workspaceId, range.from, range.to],
  );
}

export function contentTypePerformance(workspaceId: string, range: Range) {
  return all<{
    content_type: string;
    posts: number;
    reach: number | null;
    engagement: number | null;
    engagement_rate: number | null;
  }>(
    `SELECT p.content_type,
            COUNT(DISTINCT p.id) AS posts,
            SUM(m.reach) AS reach,
            SUM(m.engagement) AS engagement,
            CASE WHEN SUM(m.reach) > 0 THEN ROUND(SUM(m.engagement) * 100.0 / SUM(m.reach), 2) ELSE NULL END AS engagement_rate
       FROM social_posts p
       LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.workspace_id = ? AND p.status = 'published'
        AND (m.captured_at IS NULL OR date(m.captured_at) BETWEEN ? AND ?)
      GROUP BY p.content_type ORDER BY engagement DESC`,
    [workspaceId, range.from, range.to],
  );
}

export type TopPost = {
  id: string;
  title: string;
  platform: string;
  content_type: string;
  client_name: string | null;
  reach: number | null;
  engagement: number | null;
  engagement_rate: number | null;
  published_at: string | null;
};

export function topPosts(workspaceId: string, range: Range, limit = 5, ascending = false): TopPost[] {
  return all<TopPost>(
    `SELECT p.id, p.title, p.platform, p.content_type, c.name AS client_name,
            SUM(m.reach) AS reach, SUM(m.engagement) AS engagement,
            CASE WHEN SUM(m.reach) > 0 THEN ROUND(SUM(m.engagement) * 100.0 / SUM(m.reach), 2) ELSE NULL END AS engagement_rate,
            p.published_at
       FROM social_posts p
       LEFT JOIN clients c ON c.id = p.client_id
       JOIN post_metrics m ON m.post_id = p.id
      WHERE p.workspace_id = ? AND p.status = 'published' AND date(m.captured_at) BETWEEN ? AND ?
      GROUP BY p.id ORDER BY engagement ${ascending ? "ASC" : "DESC"} LIMIT ?`,
    [workspaceId, range.from, range.to, limit],
  );
}

/** Best posting time from published posts' engagement (factual, not predicted). */
export function bestPostingTimes(workspaceId: string) {
  return all<{ dow: number; hour: number; posts: number; avg_engagement: number | null; avg_rate: number | null }>(
    `SELECT CAST(strftime('%w', p.published_at) AS INTEGER) AS dow,
            CAST(strftime('%H', p.published_at) AS INTEGER) AS hour,
            COUNT(*) AS posts,
            ROUND(AVG(m.engagement), 1) AS avg_engagement,
            ROUND(AVG(m.engagement_rate), 2) AS avg_rate
       FROM social_posts p
       JOIN post_metrics m ON m.post_id = p.id
      WHERE p.workspace_id = ? AND p.published_at IS NOT NULL
      GROUP BY dow, hour
      HAVING posts >= 1
      ORDER BY avg_rate DESC`,
    [workspaceId],
  );
}

export function accountPerformance(workspaceId: string, range: Range) {
  return all<{
    id: string;
    name: string;
    platform: string;
    account_type: string;
    status: string;
    client_name: string | null;
    followers: number | null;
    follower_growth: number | null;
    reach: number | null;
    engagement: number | null;
    engagement_rate: number | null;
  }>(
    `SELECT sa.id, sa.name, sa.platform, sa.account_type, sa.status, c.name AS client_name,
            MAX(am.followers) AS followers, SUM(am.follower_growth) AS follower_growth,
            SUM(am.reach) AS reach, SUM(am.engagement) AS engagement,
            CASE WHEN SUM(am.reach) > 0 THEN ROUND(SUM(am.engagement) * 100.0 / SUM(am.reach), 2) ELSE NULL END AS engagement_rate
       FROM social_accounts sa
       LEFT JOIN clients c ON c.id = sa.client_id
       LEFT JOIN account_metrics am ON am.social_account_id = sa.id AND am.captured_on BETWEEN ? AND ?
      WHERE sa.workspace_id = ?
      GROUP BY sa.id ORDER BY reach DESC`,
    [range.from, range.to, workspaceId],
  );
}

export function dataSourcesNote(sources: string[]): string {
  if (sources.length === 0) return "No metric rows in this period.";
  if (sources.includes("meta")) return "Source: Meta Graph API insights.";
  if (sources.includes("demo")) return "Source: seeded demo dataset (workspace is a demo workspace).";
  return `Source: ${sources.join(", ")}.`;
}
