import "server-only";
import { all, get } from "@/lib/db";
import { bestPostingTimes, parseRange, topPosts, type Range } from "@/lib/analytics";

export type Insight = {
  id: string;
  title: string;
  body: string;
  kind: "fact" | "recommendation";
  period: string;
  source: string;
  link?: string;
  severity?: "info" | "warning" | "critical";
};

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Every insight is derived from rows in the database and states its period and
 * source. Facts and recommendations are labelled separately. Nothing here
 * predicts or invents metrics.
 */
export function buildInsights(workspaceId: string, range?: Range): Insight[] {
  const period = range ?? parseRange(new URLSearchParams({ from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }));
  const periodLabel = `${period.from} → ${period.to}`;
  const out: Insight[] = [];

  const hasDemo = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM account_metrics WHERE workspace_id = ? AND source = 'demo'",
    [workspaceId],
  );
  const demoNote = Number(hasDemo?.n ?? 0) > 0 ? " Seeded demo dataset — not live platform data." : "";

  const times = bestPostingTimes(workspaceId);
  if (times.length > 0) {
    const best = times[0]!;
    out.push({
      id: "best-time",
      title: `Best observed posting window: ${DOW[best.dow] ?? "—"} ${String(best.hour).padStart(2, "0")}:00 UTC`,
      body: `Across ${best.posts} published post${best.posts === 1 ? "" : "s"} in this window the average engagement rate was ${best.avg_rate ?? "—"}%. This is an observed average, not a forecast.${demoNote}`,
      kind: "fact",
      period: "All published posts with metrics",
      source: "post_metrics joined to social_posts.published_at",
      link: "/analytics",
    });
  }

  const under = topPosts(workspaceId, period, 3, true);
  if (under.length > 0) {
    const worst = under[0]!;
    out.push({
      id: "underperformer",
      title: `Lowest performing published post: ${worst.title}`,
      body: `Recorded ${worst.engagement ?? 0} engagements at a ${worst.engagement_rate ?? "—"}% engagement rate in ${periodLabel}. Consider a stronger first line or a different content type.${demoNote}`,
      kind: "recommendation",
      period: periodLabel,
      source: "post_metrics aggregation",
      link: "/analytics",
    });
  }

  const gaps = all<{ client_id: string; client_name: string; days: number }>(
    `SELECT c.id AS client_id, c.name AS client_name,
            COUNT(DISTINCT date(p.scheduled_at)) AS days
       FROM clients c
       LEFT JOIN social_posts p ON p.client_id = c.id AND p.workspace_id = c.workspace_id
        AND p.scheduled_at BETWEEN ? AND ? AND p.status NOT IN ('archived','idea')
      WHERE c.workspace_id = ? GROUP BY c.id HAVING days = 0`,
    [`${period.from}T00:00:00.000Z`, `${period.to}T23:59:59.999Z`, workspaceId],
  );
  for (const gap of gaps.slice(0, 3)) {
    out.push({
      id: `gap-${gap.client_id}`,
      title: `Publishing gap: ${gap.client_name}`,
      body: `No post is scheduled for ${gap.client_name} inside ${periodLabel}. The calendar view for this client is empty.`,
      kind: "fact",
      period: periodLabel,
      source: "social_posts.scheduled_at",
      link: "/calendar",
    });
  }

  const overdue = all<{ id: string; title: string; due_date: string }>(
    `SELECT id, title, due_date FROM tasks WHERE workspace_id = ? AND status != 'done' AND due_date < ? ORDER BY due_date ASC LIMIT 5`,
    [workspaceId, new Date().toISOString()],
  );
  if (overdue.length > 0) {
    out.push({
      id: "overdue-tasks",
      title: `${overdue.length} task${overdue.length === 1 ? "" : "s"} past due`,
      body: `Oldest: “${overdue[0]!.title}” due ${overdue[0]!.due_date.slice(0, 10)}. Overdue work blocks the downstream publishing slots it feeds.`,
      kind: "fact",
      period: "As of now",
      source: "tasks.due_date",
      link: "/tasks",
      severity: "warning",
    });
  }

  const pendingApprovals = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM content_approvals WHERE workspace_id = ? AND status = 'pending'`,
    [workspaceId],
  );
  if (Number(pendingApprovals?.n ?? 0) > 0) {
    out.push({
      id: "approvals-waiting",
      title: `${pendingApprovals!.n} approval${Number(pendingApprovals!.n) === 1 ? "" : "s"} waiting`,
      body: "Posts with a pending approval stage cannot be published. Clear the oldest stage first to unblock the queue.",
      kind: "recommendation",
      period: "As of now",
      source: "content_approvals.status",
      link: "/approvals",
    });
  }

  const repurpose = all<{ id: string; title: string; content_type: string; platform: string }>(
    `SELECT p.id, p.title, p.content_type, p.platform FROM social_posts p
      JOIN post_metrics m ON m.post_id = p.id
     WHERE p.workspace_id = ? AND p.status = 'published'
     GROUP BY p.id ORDER BY MAX(m.engagement_rate) DESC LIMIT 2`,
    [workspaceId],
  );
  for (const post of repurpose) {
    out.push({
      id: `repurpose-${post.id}`,
      title: `Repurpose candidate: ${post.title}`,
      body: `This ${post.content_type} post is among your strongest in ${periodLabel}. A companion ${post.platform === "instagram" ? "reel" : "carousel"} reusing the same hook is the cheapest next test.${demoNote}`,
      kind: "recommendation",
      period: periodLabel,
      source: "post_metrics.engagement_rate ranking",
      link: `/content-studio?post=${post.id}`,
    });
  }

  return out;
}

export function teamWorkload(workspaceId: string) {
  return all<{ user_id: string; full_name: string; avatar_color: string; open_tasks: number; overdue: number; reviews: number }>(
    `SELECT u.id AS user_id, u.full_name, u.avatar_color,
            SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END) AS open_tasks,
            SUM(CASE WHEN t.status != 'done' AND t.due_date < ? THEN 1 ELSE 0 END) AS overdue,
            (SELECT COUNT(*) FROM content_approvals ca WHERE ca.reviewer_id = u.id AND ca.status = 'pending') AS reviews
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
       LEFT JOIN tasks t ON t.assignee_id = u.id AND t.workspace_id = ?
      GROUP BY u.id ORDER BY open_tasks DESC`,
    [new Date().toISOString(), workspaceId, workspaceId],
  );
}
