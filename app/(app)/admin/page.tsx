import { all, get } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Badge, Banner, Card, EmptyState, PageHeader, SectionHeader, StatCard, Progress } from "@/components/ui";
import { formatDateTime, formatNumber, label, timeAgo } from "@/lib/utils";

export default async function AdminPage() {
  const ctx = await requirePermission("admin.view");

  const totals = {
    users: get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE is_active = 1")?.n ?? 0,
    workspaces: get<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces")?.n ?? 0,
    accounts: get<{ n: number }>("SELECT COUNT(*) AS n FROM social_accounts")?.n ?? 0,
    liveAccounts: get<{ n: number }>("SELECT COUNT(*) AS n FROM social_accounts WHERE status = 'connected'")?.n ?? 0,
    jobs: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs")?.n ?? 0,
    failedJobs: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE status IN ('failed','dead')")?.n ?? 0,
    queued: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE status = 'queued'")?.n ?? 0,
    running: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE status = 'running'")?.n ?? 0,
    posts: get<{ n: number }>("SELECT COUNT(*) AS n FROM social_posts")?.n ?? 0,
    assets: get<{ n: number }>("SELECT COUNT(*) AS n FROM media_assets WHERE deleted_at IS NULL")?.n ?? 0,
    storage: get<{ total: number | null }>("SELECT SUM(size_bytes) AS total FROM media_assets WHERE deleted_at IS NULL")?.total ?? 0,
    pauseCount: get<{ n: number }>("SELECT COUNT(*) AS n FROM queue_state WHERE is_paused = 1")?.n ?? 0,
  };

  const workspaces = all<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    is_demo: number;
    created_at: string;
    members: number;
    clients: number;
    posts: number;
    accounts: number;
    failed_jobs: number;
  }>(
    `SELECT w.id, w.name, w.slug, w.plan, w.is_demo, w.created_at,
            (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS members,
            (SELECT COUNT(*) FROM clients c WHERE c.workspace_id = w.id) AS clients,
            (SELECT COUNT(*) FROM social_posts p WHERE p.workspace_id = w.id) AS posts,
            (SELECT COUNT(*) FROM social_accounts sa WHERE sa.workspace_id = w.id) AS accounts,
            (SELECT COUNT(*) FROM publishing_jobs j WHERE j.workspace_id = w.id AND j.status IN ('failed','dead')) AS failed_jobs
       FROM workspaces w ORDER BY w.created_at ASC`,
  );

  const users = all<{ id: string; email: string; full_name: string; is_super_admin: number; is_active: number; last_login_at: string | null; created_at: string }>(
    "SELECT id, email, full_name, is_super_admin, is_active, last_login_at, created_at FROM users ORDER BY created_at ASC LIMIT 50",
  );

  const audit = all<{ id: string; action: string; entity_type: string | null; created_at: string; full_name: string | null; workspace_name: string | null }>(
    `SELECT al.id, al.action, al.entity_type, al.created_at, u.full_name, w.name AS workspace_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id LEFT JOIN workspaces w ON w.id = al.workspace_id
      ORDER BY al.created_at DESC LIMIT 30`,
  );

  const security = all<{ id: string; kind: string; severity: string; detail: string; ip: string | null; created_at: string }>(
    "SELECT id, kind, severity, detail, ip, created_at FROM security_events ORDER BY created_at DESC LIMIT 20",
  );

  const syncIssues = all<{ id: string; kind: string; status: string; error: string | null; created_at: string; account_name: string | null }>(
    `SELECT sj.id, sj.kind, sj.status, sj.error, sj.created_at, sa.name AS account_name
       FROM sync_jobs sj LEFT JOIN social_accounts sa ON sa.id = sj.social_account_id
      WHERE sj.status != 'succeeded' ORDER BY sj.created_at DESC LIMIT 10`,
  );

  const webhookStats = get<{ total: number; invalid: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN signature_valid = 0 THEN 1 ELSE 0 END) AS invalid FROM integration_webhooks",
  );

  const scheduler = process.env.ENABLE_INPROCESS_SCHEDULER !== "false";
  const interval = process.env.SCHEDULER_INTERVAL_SECONDS ?? "20";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Admin Control Center"
        description="Platform-wide health: queues, workers, storage, integrations, security events and audit trails. Visible to super admins only."
        meta={<Badge status="approved">signed in as {ctx.user.email}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={String(totals.users)} hint="active accounts" />
        <StatCard label="Workspaces" value={String(totals.workspaces)} hint="tenant isolation enforced" />
        <StatCard label="Connected accounts" value={`${totals.liveAccounts}/${totals.accounts}`} hint="live / total" />
        <StatCard label="Publishing jobs" value={String(totals.jobs)} hint={`${totals.queued} queued · ${totals.running} running`} />
        <StatCard label="Failed / dead jobs" value={String(totals.failedJobs)} hint="retry from the queue" />
        <StatCard label="Content records" value={String(totals.posts)} hint="all workspaces" />
        <StatCard label="Media assets" value={String(totals.assets)} hint={`${formatNumber(Math.round(totals.storage / 1024))} KB stored`} />
        <StatCard label="Paused queues" value={String(totals.pauseCount)} hint="workspaces with paused delivery" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionHeader title="Worker status" description="How publishing is being executed." />
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">In-process scheduler</span><Badge status={scheduler ? "approved" : "draft"}>{scheduler ? "running" : "disabled"}</Badge></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Tick interval</span><span className="font-mono">{interval}s</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Worker secret</span><Badge status={process.env.WORKER_SECRET ? "approved" : "draft"}>{process.env.WORKER_SECRET ? "set" : "unset"}</Badge></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Queue health</span><span>{totals.failedJobs === 0 ? "healthy" : `${totals.failedJobs} failing`}</span></div>
          </div>
          <div className="mt-2"><Progress value={totals.jobs === 0 ? 100 : ((totals.jobs - totals.failedJobs) / totals.jobs) * 100} tone={totals.failedJobs > 0 ? "var(--warn)" : "var(--ok)"} /></div>
          <p className="mt-2 text-[10.5px] text-[var(--muted)]">
            Job execution is durable: a stopped app resumes queued jobs on the next tick. Dead-letter jobs require manual retry.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Integration health" description="Tokens, sync failures and webhook verification." />
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Meta app</span><Badge status={process.env.META_APP_ID && process.env.META_APP_SECRET ? "approved" : "failed"}>{process.env.META_APP_ID ? "configured" : "unset"}</Badge></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Webhook verify token</span><Badge status={process.env.META_WEBHOOK_VERIFY_TOKEN ? "approved" : "draft"}>{process.env.META_WEBHOOK_VERIFY_TOKEN ? "set" : "unset"}</Badge></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Webhook events</span><span>{webhookStats?.total ?? 0} total · {webhookStats?.invalid ?? 0} rejected</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">AI provider</span><span>{process.env.OLLAMA_BASE_URL ? "ollama configured" : "template engine"}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Email</span><Badge status={process.env.SMTP_URL ? "approved" : "draft"}>{process.env.SMTP_URL ? "configured" : "off"}</Badge></div>
          </div>
          {syncIssues.length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10.5px] text-amber-200">
              {syncIssues.slice(0, 3).map((issue) => (
                <p key={issue.id}>{issue.account_name ?? "account"} · {issue.kind}: {issue.error ?? issue.status}</p>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="API errors" description="Sync and webhook failures recorded by the platform." />
          <div className="mt-2 space-y-1.5">
            {syncIssues.length === 0 && <p className="text-[11.5px] text-[var(--muted)]">No failing sync jobs.</p>}
            {syncIssues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2 py-1.5 text-[10.5px]">
                <p className="flex items-center justify-between">
                  <span>{issue.account_name ?? "unknown account"} · {issue.kind}</span>
                  <Badge status="failed">{issue.status}</Badge>
                </p>
                <p className="mt-0.5 text-[var(--muted)]">{issue.error ?? "no error message"}</p>
                <p className="text-[9.5px] text-[var(--muted)]">{timeAgo(issue.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13.5px] font-semibold">Workspaces</p>
          <p className="text-[11px] text-[var(--muted)]">Every row is isolated by workspace_id; cross-tenant reads return 404 by design.</p>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr>{["Workspace", "Plan", "Members", "Brands", "Posts", "Accounts", "Failed jobs", "Created", "Type"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {workspaces.map((workspace) => (
                <tr key={workspace.id}>
                  <td className="font-medium">{workspace.name}<span className="ml-1 text-[10px] text-[var(--muted)]">{workspace.slug}</span></td>
                  <td className="text-[11px]">{workspace.plan}</td>
                  <td>{workspace.members}</td>
                  <td>{workspace.clients}</td>
                  <td>{workspace.posts}</td>
                  <td>{workspace.accounts}</td>
                  <td className={workspace.failed_jobs > 0 ? "text-rose-300" : undefined}>{workspace.failed_jobs}</td>
                  <td className="text-[10.5px] text-[var(--muted)]">{formatDateTime(workspace.created_at)}</td>
                  <td><Badge status={workspace.is_demo ? "pending" : "approved"}>{workspace.is_demo ? "demo" : "live"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5"><p className="text-[13.5px] font-semibold">Audit log</p></div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr>{["Actor", "Action", "Entity", "Workspace", "When"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-[11.5px]">{entry.full_name ?? "system"}</td>
                    <td className="text-[11.5px]">{entry.action}</td>
                    <td className="text-[11px] text-[var(--muted)]">{entry.entity_type ?? "—"}</td>
                    <td className="text-[11px] text-[var(--muted)]">{entry.workspace_name ?? "—"}</td>
                    <td className="text-[10.5px] text-[var(--muted)]">{timeAgo(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.length === 0 && <EmptyState title="No audit entries" description="Actions are logged as soon as users start working." />}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5"><p className="text-[13.5px] font-semibold">Security events</p></div>
          <div className="divide-y divide-[var(--line)]">
            {security.map((event) => (
              <div key={event.id} className="px-4 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11.5px] font-medium">{label(event.kind)}</p>
                  <Badge status={event.severity === "critical" ? "failed" : event.severity === "warning" ? "pending" : "draft"}>{event.severity}</Badge>
                </div>
                <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">{event.detail}</p>
                <p className="text-[9.5px] text-[var(--muted)]">{event.ip ?? "no ip"} · {formatDateTime(event.created_at)}</p>
              </div>
            ))}
            {security.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">No security events.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-2.5"><p className="text-[13.5px] font-semibold">Users</p></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr>{["Name", "Email", "Super admin", "Status", "Last login", "Created"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">{user.full_name}</td>
                  <td className="text-[11.5px] text-[var(--muted)]">{user.email}</td>
                  <td>{user.is_super_admin ? <Badge status="approved">yes</Badge> : <span className="text-[11px] text-[var(--muted)]">no</span>}</td>
                  <td><Badge status={user.is_active ? "active" : "failed"}>{user.is_active ? "active" : "disabled"}</Badge></td>
                  <td className="text-[10.5px] text-[var(--muted)]">{user.last_login_at ? timeAgo(user.last_login_at) : "never"}</td>
                  <td className="text-[10.5px] text-[var(--muted)]">{formatDateTime(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Banner tone="info" title="Retention and backups">
        Audit logs, metrics and publishing attempts are retained indefinitely by default. For production, schedule a nightly copy of
        the database file (SQLite) or a pg_dump, plus the storage uploads directory — see DEPLOYMENT.md. No destructive admin action is
        exposed in this UI.
      </Banner>
    </div>
  );
}
