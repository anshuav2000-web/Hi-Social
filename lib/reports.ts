import "server-only";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { buildInsights } from "@/lib/insights";
import {
  accountKpis,
  accountPerformance,
  contentTypePerformance,
  dailyTrend,
  platformBreakdown,
  topPosts,
  type Range,
} from "@/lib/analytics";

export type ReportPayload = {
  kpis: ReturnType<typeof accountKpis>;
  trend: ReturnType<typeof dailyTrend>;
  platforms: ReturnType<typeof platformBreakdown>;
  contentTypes: ReturnType<typeof contentTypePerformance>;
  accounts: ReturnType<typeof accountPerformance>;
  topPosts: ReturnType<typeof topPosts>;
  insights: ReturnType<typeof buildInsights>;
  generatedAt: string;
};

export function buildReportPayload(workspaceId: string, range: Range, clientId?: string | null): ReportPayload {
  const scope = clientId ? [clientId] : null;
  return {
    kpis: accountKpis(workspaceId, range, scope),
    trend: dailyTrend(workspaceId, range, scope),
    platforms: platformBreakdown(workspaceId, range),
    contentTypes: contentTypePerformance(workspaceId, range),
    accounts: accountPerformance(workspaceId, range),
    topPosts: topPosts(workspaceId, range, 10),
    insights: buildInsights(workspaceId, range),
    generatedAt: nowIso(),
  };
}

export function saveReport(input: {
  workspaceId: string;
  clientId?: string | null;
  name: string;
  kind: string;
  range: Range;
  format: string;
  actorId: string;
}) {
  const payload = buildReportPayload(input.workspaceId, input.range, input.clientId);
  const id = uid();
  run(
    `INSERT INTO reports (id, workspace_id, client_id, name, kind, period_start, period_end, format, status, payload_json, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,'ready',?,?,?)`,
    [
      id,
      input.workspaceId,
      input.clientId ? input.clientId : null,
      input.name,
      input.kind,
      input.range.from,
      input.range.to,
      input.format,
      JSON.stringify(payload),
      input.actorId,
      nowIso(),
    ],
  );
  return { id, payload };
}

export function reportRows(payload: ReportPayload) {
  const rows: (string | number | null)[][] = [];
  const push = (metric: string, value: string | number | null, source = "account_metrics") =>
    rows.push([metric, value ?? "n/a", source]);
  push("Reach", payload.kpis.reach);
  push("Impressions", payload.kpis.impressions);
  push("Engagement", payload.kpis.engagement);
  push("Engagement rate (%)", payload.kpis.engagementRate);
  push("Followers", payload.kpis.followers);
  push("Follower growth", payload.kpis.followerGrowth);
  push("Published posts", payload.kpis.publishedPosts, "social_posts");
  push("Scheduled posts", payload.kpis.scheduledPosts, "social_posts");
  push("Pending approvals", payload.kpis.pendingApprovals, "content_approvals");
  push("Failed publications", payload.kpis.failedPublications, "publishing_jobs");
  push("Data source", payload.kpis.sources.join(", ") || "none", "metric rows");
  return rows;
}

export function reportSummaryText(payload: ReportPayload, range: Range, clientName?: string | null) {
  const lines = [
    `Reporting period: ${range.from} → ${range.to}`,
    clientName ? `Client: ${clientName}` : "Scope: entire workspace",
    `Reach: ${payload.kpis.reach ?? "n/a"} · Impressions: ${payload.kpis.impressions ?? "n/a"} · Engagement: ${payload.kpis.engagement ?? "n/a"}`,
    `Engagement rate: ${payload.kpis.engagementRate ?? "n/a"}% (engagement ÷ reach)`,
    `Followers: ${payload.kpis.followers ?? "n/a"} · net growth: ${payload.kpis.followerGrowth ?? "n/a"}`,
    `Published: ${payload.kpis.publishedPosts} · scheduled: ${payload.kpis.scheduledPosts} · pending approvals: ${payload.kpis.pendingApprovals}`,
    `Data source: ${payload.kpis.sources.join(", ") || "no metric rows"}`,
    "",
    "Notes: metrics a platform does not report are shown as n/a, never as zero. Recommendations are hypotheses derived from the rows above.",
  ];
  return lines.join("\n");
}
