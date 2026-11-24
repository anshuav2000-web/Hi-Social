import Link from "next/link";
import {
  ArrowUpRight,
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Eye,
  Heart,
  Megaphone,
  MessageCircle,
  Radio,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { all, get } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { scopedClientIds } from "@/lib/api-guard";
import {
  accountKpis,
  bestPostingTimes,
  contentTypePerformance,
  dailyTrend,
  parseRange,
  platformBreakdown,
  topPosts,
} from "@/lib/analytics";
import { buildInsights, teamWorkload } from "@/lib/insights";
import { formatDate, formatDateTime, formatNumber, formatPercent, label, pctChange, timeAgo } from "@/lib/utils";
import { Avatar, Badge, Banner, Card, DemoDataNotice, EmptyState, PageHeader, PlatformDot, Progress, SectionHeader, StatCard } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { SharePie, TrendChart } from "@/components/charts";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const url = new URLSearchParams(params as Record<string, string>);
  const range = parseRange(url, 30);
  const isDemo = ctx.workspace.is_demo === 1;
  const scoped = scopedClientIds(ctx);

  const prevEnd = new Date(new Date(range.from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevStart = new Date(new Date(range.from).getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const kpis = accountKpis(ctx.workspace.id, range, scoped);
  const prev = accountKpis(ctx.workspace.id, { from: prevStart, to: prevEnd }, scoped);
  const trend = dailyTrend(ctx.workspace.id, range, scoped);
  const platforms = platformBreakdown(ctx.workspace.id, range);
  const contentTypes = contentTypePerformance(ctx.workspace.id, range);
  const best = bestPostingTimes(ctx.workspace.id).slice(0, 4);
  const top = topPosts(ctx.workspace.id, range, 4);
  const bottom = topPosts(ctx.workspace.id, range, 3, true);
  const insights = buildInsights(ctx.workspace.id, range);
  const workload = teamWorkload(ctx.workspace.id).slice(0, 5);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayQueue = all<{
    id: string;
    post_title: string;
    platform: string;
    run_at: string;
    status: string;
    channel: string;
    client_name: string | null;
  }>(
    `SELECT j.id, p.title AS post_title, j.platform, j.run_at, j.status, j.channel, c.name AS client_name
       FROM publishing_jobs j JOIN social_posts p ON p.id = j.post_id LEFT JOIN clients c ON c.id = p.client_id
      WHERE j.workspace_id = ? AND date(j.run_at) = date(?) AND j.status IN ('queued','running')
      ORDER BY j.run_at ASC LIMIT 6`,
    [ctx.workspace.id, todayStart.toISOString()],
  );

  const upcoming = all<{
    id: string;
    title: string;
    platform: string;
    scheduled_at: string;
    status: string;
    client_name: string | null;
    media_count: number;
  }>(
    `SELECT p.id, p.title, p.platform, p.scheduled_at, p.status, c.name AS client_name,
            (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count
       FROM social_posts p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.workspace_id = ? AND p.status IN ('scheduled','approved')
      ORDER BY p.scheduled_at ASC LIMIT 6`,
    [ctx.workspace.id],
  );

  const pendingTasks = all<{ id: string; title: string; due_date: string; priority: string; assignee: string | null }>(
    `SELECT t.id, t.title, t.due_date, t.priority, u.full_name AS assignee
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.workspace_id = ? AND t.status != 'done' ORDER BY t.due_date ASC LIMIT 6`,
    [ctx.workspace.id],
  );

  const pendingApprovals = all<{
    id: string;
    post_title: string;
    stage: string;
    due_at: string;
    reviewer_name: string | null;
    client_name: string | null;
  }>(
    `SELECT ca.id, p.title AS post_title, ca.stage, ca.due_at, u.full_name AS reviewer_name, c.name AS client_name
       FROM content_approvals ca JOIN social_posts p ON p.id = ca.post_id
       LEFT JOIN users u ON u.id = ca.reviewer_id LEFT JOIN clients c ON c.id = p.client_id
      WHERE ca.workspace_id = ? AND ca.status = 'pending' ORDER BY ca.due_at ASC LIMIT 6`,
    [ctx.workspace.id],
  );

  const accounts = all<{ id: string; name: string; platform: string; status: string; followers_count: number | null; last_synced_at: string | null }>(
    "SELECT id, name, platform, status, followers_count, last_synced_at FROM social_accounts WHERE workspace_id = ? ORDER BY platform",
    [ctx.workspace.id],
  );

  const activity = all<{ id: string; action: string; entity_type: string; created_at: string; full_name: string | null; avatar_color: string | null }>(
    `SELECT al.id, al.action, al.entity_type, al.created_at, u.full_name, u.avatar_color
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
      WHERE al.workspace_id = ? ORDER BY al.created_at DESC LIMIT 8`,
    [ctx.workspace.id],
  );

  const failedJobs = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status IN ('failed','dead')",
    [ctx.workspace.id],
  );
  const connected = accounts.filter((a) => a.status === "connected").length;
  const sandbox = accounts.filter((a) => a.status !== "connected").length;

  const firstName = ctx.user.full_name.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={`Good to see you, ${firstName}`}
        description={`${range.from} → ${range.to} · ${ctx.workspace.name} · ${ctx.workspace.role_label}`}
        actions={<RangePicker basePath="/dashboard" />}
      />

      {isDemo && <DemoDataNotice isDemo={isDemo} />}
      {sandbox > 0 && (
        <Banner tone="info" title={`${sandbox} of ${accounts.length} social accounts are in sandbox mode`}>
          Publishing is recorded locally and labelled “sandbox” — nothing is sent to Meta until an account is connected in{" "}
          <Link href="/integrations" className="underline">Integrations</Link>.
        </Banner>
      )}

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total reach"
          value={formatNumber(kpis.reach)}
          delta={pctChange(kpis.reach, prev.reach)}
          hint="vs previous period"
          icon={<Radio size={15} />}
        />
        <StatCard
          label="Impressions"
          value={formatNumber(kpis.impressions)}
          delta={pctChange(kpis.impressions, prev.impressions)}
          hint="vs previous period"
          icon={<Eye size={15} />}
        />
        <StatCard
          label="Engagement"
          value={formatNumber(kpis.engagement)}
          delta={pctChange(kpis.engagement, prev.engagement)}
          hint="likes + comments + shares + saves"
          icon={<Heart size={15} />}
        />
        <StatCard
          label="Engagement rate"
          value={formatPercent(kpis.engagementRate)}
          delta={pctChange(kpis.engagementRate, prev.engagementRate)}
          hint="engagement ÷ reach"
          icon={<TrendingUp size={15} />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Followers" value={formatNumber(kpis.followers)} hint={`${formatNumber(kpis.followerGrowth)} net new in period`} icon={<Users size={15} />} />
        <StatCard label="Published posts" value={String(kpis.publishedPosts)} hint={`${kpis.scheduledPosts} scheduled`} icon={<Rocket size={15} />} />
        <StatCard
          label="Pending approvals"
          value={String(kpis.pendingApprovals)}
          hint="blocking publication"
          icon={<ShieldCheck size={15} />}
          footer={<Link href="/approvals" className="text-[var(--accent)] hover:underline">Open approvals →</Link>}
        />
        <StatCard
          label="Failed publications"
          value={String(failedJobs?.n ?? 0)}
          hint={(failedJobs?.n ?? 0) > 0 ? "needs attention" : "queue healthy"}
          icon={<AlertTriangle size={15} />}
          footer={<Link href="/publishing-queue" className="text-[var(--accent)] hover:underline">Open queue →</Link>}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <SectionHeader
            title="Reach & engagement trend"
            description="Daily sums from account_metrics. Empty days are omitted, not zero-filled."
            actions={<Badge status={isDemo ? "draft" : "published"}>{isDemo ? "Demo dataset" : "Live API data"}</Badge>}
          />
          <div className="mt-4">
            <TrendChart
              data={trend as unknown as Array<Record<string, string | number | null>>}
              series={[
                { key: "reach", label: "Reach", color: "#1677FF" },
                { key: "engagement", label: "Engagement", color: "#35A7FF" },
              ]}
              height={250}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Channel mix" description="Share of reach by platform." />
          <div className="mt-3">
            <SharePie
              data={platforms.map((p) => ({ name: label(p.platform), value: p.reach ?? 0 }))}
              colors={["#E1306C", "#1877F2", "#0A66C2", "#F59E0B"]}
            />
          </div>
          <div className="mt-2 space-y-1.5">
            {platforms.length === 0 && <p className="text-[12px] text-[var(--muted)]">No platform metrics in this period.</p>}
            {platforms.map((p) => (
              <div key={p.platform} className="flex items-center justify-between text-[12px]">
                <PlatformDot platform={p.platform} />
                <span className="text-[var(--muted)]">{formatNumber(p.reach)} reach</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Widgets */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <SectionHeader title="Today's publishing queue" description="Jobs scheduled for today." actions={<Link href="/publishing-queue" className="text-[11px] text-[var(--accent)]">Queue</Link>} />
          <div className="mt-3 space-y-2">
            {todayQueue.length === 0 && <p className="text-[12px] text-[var(--muted)]">Nothing queued for today.</p>}
            {todayQueue.map((job) => (
              <div key={job.id} className="flex items-start justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium">{job.post_title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {formatDateTime(job.run_at)} · {job.client_name ?? "No client"}
                  </p>
                </div>
                <Badge status={job.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Upcoming posts" description="Approved or scheduled, next up." actions={<Link href="/calendar" className="text-[11px] text-[var(--accent)]">Calendar</Link>} />
          <div className="mt-3 space-y-2">
            {upcoming.length === 0 && <p className="text-[12px] text-[var(--muted)]">No upcoming posts. Plan one from the calendar.</p>}
            {upcoming.map((post) => (
              <Link key={post.id} href={`/content-studio?post=${post.id}`} className="block rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 hover:border-[var(--line-strong)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[12.5px] font-medium">{post.title}</p>
                  <Badge status={post.status} />
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {post.scheduled_at ? formatDateTime(post.scheduled_at) : "Unscheduled"} · {post.client_name ?? "No client"} ·{" "}
                  {post.media_count > 0 ? `${post.media_count} asset(s)` : "no media"}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Pending approvals" description="Nothing publishes until every stage is approved." actions={<Link href="/approvals" className="text-[11px] text-[var(--accent)]">Review</Link>} />
          <div className="mt-3 space-y-2">
            {pendingApprovals.length === 0 && <p className="text-[12px] text-[var(--muted)]">Approval queue is clear.</p>}
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <p className="truncate text-[12.5px] font-medium">{approval.post_title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {label(approval.stage)} · {approval.client_name ?? "No client"} · due {formatDate(approval.due_at)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Content type performance" description="Published posts in this period." actions={<Link href="/analytics" className="text-[11px] text-[var(--accent)]">Analytics</Link>} />
          <div className="mt-3 space-y-2.5">
            {contentTypes.length === 0 && <p className="text-[12px] text-[var(--muted)]">No published content yet.</p>}
            {contentTypes.slice(0, 5).map((type) => {
              const max = Math.max(...contentTypes.map((t) => t.engagement ?? 0), 1);
              return (
                <div key={type.content_type}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="capitalize">{label(type.content_type)}</span>
                    <span className="text-[var(--muted)]">{formatNumber(type.engagement)} eng · {formatPercent(type.engagement_rate)}</span>
                  </div>
                  <div className="mt-1"><Progress value={((type.engagement ?? 0) / max) * 100} /></div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Best observed posting windows" description="Averages from published posts, not a forecast." />
          <div className="mt-3 space-y-1.5">
            {best.length === 0 && <p className="text-[12px] text-[var(--muted)]">Not enough published data yet.</p>}
            {best.map((slot) => (
              <div key={`${slot.dow}-${slot.hour}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5 text-[12px]">
                <span className="flex items-center gap-1.5"><CalendarClock size={12} className="text-[var(--accent)]" /> {DOW[slot.dow]} {String(slot.hour).padStart(2, "0")}:00 UTC</span>
                <span className="text-[var(--muted)]">{formatPercent(slot.avg_rate)} · {slot.posts} posts</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Integration health" description="Token + sync status per account." actions={<Link href="/integrations" className="text-[11px] text-[var(--accent)]">Manage</Link>} />
          <div className="mt-3 space-y-2">
            {accounts.length === 0 && <p className="text-[12px] text-[var(--muted)]">No social accounts connected.</p>}
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-2 text-[12px]">
                <div className="min-w-0">
                  <p className="truncate">{account.name}</p>
                  <p className="text-[10.5px] text-[var(--muted)]">
                    {label(account.platform)} · {account.last_synced_at ? `synced ${timeAgo(account.last_synced_at)}` : "never synced"}
                  </p>
                </div>
                <Badge status={account.status === "connected" ? "published" : "draft"}>{account.status === "connected" ? "Live" : "Sandbox"}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 text-[11px] text-[var(--muted)]">
            {connected} live · {sandbox} sandbox
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <SectionHeader
            title="AI recommendations"
            description="Derived from this workspace's own data, with the evidence stated."
            actions={<Link href="/ai-assistant" className="text-[11px] text-[var(--accent)]">Open assistant</Link>}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <div key={insight.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium leading-snug">{insight.title}</p>
                  <Badge status={insight.kind === "fact" ? "approved" : "review"}>{insight.kind}</Badge>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{insight.body}</p>
              </div>
            ))}
            {insights.length === 0 && <p className="text-[12px] text-[var(--muted)]">No insights — add content and metrics first.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionHeader title="Top performing content" description="By total engagement in period." />
          <div className="mt-3 space-y-2">
            {top.length === 0 && <p className="text-[12px] text-[var(--muted)]">No metrics recorded yet.</p>}
            {top.map((post) => (
              <Link key={post.id} href={`/content-studio?post=${post.id}`} className="block rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 hover:border-[var(--line-strong)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-medium">{post.title}</p>
                  <span className="text-[11px] text-emerald-400">{formatPercent(post.engagement_rate)}</span>
                </div>
                <p className="text-[10.5px] text-[var(--muted)]">{post.client_name} · {label(post.content_type)} · {formatNumber(post.engagement)} engagement</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Underperforming content" description="Lowest engagement in the same period." />
          <div className="mt-3 space-y-2">
            {bottom.length === 0 && <p className="text-[12px] text-[var(--muted)]">No metrics recorded yet.</p>}
            {bottom.map((post) => (
              <div key={post.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-medium">{post.title}</p>
                  <span className="text-[11px] text-amber-400">{formatPercent(post.engagement_rate)}</span>
                </div>
                <p className="text-[10.5px] text-[var(--muted)]">{post.client_name} · {formatNumber(post.engagement)} engagement</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Team workload" description="Open tasks, overdue and reviews." actions={<Link href="/team" className="text-[11px] text-[var(--accent)]">Team</Link>} />
          <div className="mt-3 space-y-2">
            {workload.map((member) => (
              <div key={member.user_id} className="flex items-center gap-2.5">
                <Avatar name={member.full_name} color={member.avatar_color} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="truncate">{member.full_name}</span>
                    <span className="text-[var(--muted)]">{member.open_tasks} open</span>
                  </div>
                  <div className="mt-1"><Progress value={Math.min(100, (member.open_tasks / 8) * 100)} tone={member.overdue > 0 ? "var(--danger)" : "var(--brand)"} /></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Pending tasks" description="Across all clients." actions={<Link href="/tasks" className="text-[11px] text-[var(--accent)]">All tasks</Link>} />
          <div className="mt-3 space-y-2">
            {pendingTasks.length === 0 && <p className="text-[12px] text-[var(--muted)]">No open tasks.</p>}
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="min-w-0">
                  <span className="block truncate">{task.title}</span>
                  <span className="text-[10.5px] text-[var(--muted)]">{task.assignee ?? "Unassigned"} · due {formatDate(task.due_date)}</span>
                </span>
                <Badge status={task.priority} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Recent activity" description="Every mutating action is audited." actions={<Link href="/admin" className="text-[11px] text-[var(--accent)]">Audit</Link>} />
          <div className="mt-3 space-y-2">
            {activity.length === 0 && <p className="text-[12px] text-[var(--muted)]">No activity yet.</p>}
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-[11.5px]">
                {item.full_name ? <Avatar name={item.full_name} color={item.avatar_color} size={20} /> : <ClipboardList size={14} className="text-[var(--muted)]" />}
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[var(--fg)]">{item.full_name ?? "System"}</span>{" "}
                  <span className="text-[var(--muted)]">{item.action.replace(/[._]/g, " ")}</span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--muted)]">{timeAgo(item.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Quick actions" description="Jump straight into the workflow." />
          <div className="mt-3 grid gap-2">
            {[
              { href: "/content-studio?new=1", label: "Create a post", icon: Zap },
              { href: "/calendar", label: "Open the calendar", icon: CalendarClock },
              { href: "/tasks", label: "Assign production tasks", icon: CheckSquare },
              { href: "/reports", label: "Export a client report", icon: MessageCircle },
              { href: "/campaigns", label: "Manage campaigns", icon: Megaphone },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-2 text-[12px] hover:border-[var(--line-strong)]">
                <span className="flex items-center gap-2"><action.icon size={13} className="text-[var(--accent)]" /> {action.label}</span>
                <ArrowUpRight size={13} className="text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {insights.length === 0 && (
        <EmptyState
          title="No insights yet"
          description="Insights appear once you have scheduled or published content with metrics attached."
          action={<Link href="/content-studio?new=1" className="btn btn-primary">Create your first post</Link>}
        />
      )}
    </div>
  );
}
