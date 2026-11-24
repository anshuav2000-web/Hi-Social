"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Pause, Play, RefreshCw, RotateCcw, X, Zap } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Card, EmptyState, SectionHeader, StatCard } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { useToast } from "@/components/toast";
import { formatDateTime, label, timeAgo } from "@/lib/utils";

type Job = {
  id: string;
  post_id: string;
  post_title: string;
  platform: string;
  status: string;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  channel: string;
  client_name: string | null;
  account_name: string | null;
  account_status: string | null;
  attempt_count: number;
  content_type: string;
};

type Health = {
  queued: number;
  running: number;
  failed: number;
  dead: number;
  succeeded: number;
  paused: boolean;
  nextRun: string | null;
};

export function QueueClient({ canPublish }: { canPublish: boolean }) {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api<{ rows: Job[]; health: Health }>(`/api/v1/queue?status=${statusFilter}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setJobs(res.data.rows);
    setHealth(res.data.health);
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const act = async (action: string, jobId?: string) => {
    setBusy(jobId ?? action);
    const res = await api("/api/v1/queue", { method: "POST", json: { action, jobId } });
    if (action === "tick") {
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const data = res.data as unknown as { processed: number; succeeded: number; failed: number };
      toast.info("Worker tick", `processed ${data.processed} · ok ${data.succeeded} · failed ${data.failed}`);
      await load();
      return;
    }
    if (!res.ok) {
      setBusy(null);
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    setBusy(null);
    toast.success(`${label(action)} applied`);
    await load();
  };

  const filtered = useMemo(
    () => jobs.filter((job) => (search ? job.post_title.toLowerCase().includes(search.toLowerCase()) : true)),
    [jobs, search],
  );

  const columns: Column<Job>[] = [
    {
      key: "post",
      header: "Post",
      render: (job) => (
        <div className="min-w-0">
          <Link href={`/content-studio?post=${job.post_id}`} className="truncate text-[12.5px] font-medium hover:underline">
            {job.post_title}
          </Link>
          <p className="text-[10.5px] text-[var(--muted)]">{job.client_name ?? "No client"} · {label(job.content_type)}</p>
        </div>
      ),
    },
    { key: "account", header: "Account", render: (job) => (
      <div className="text-[11.5px]">
        <p>{job.account_name ?? "—"}</p>
        <p className="text-[10px] text-[var(--muted)]">{job.account_status === "connected" ? "live token" : "sandbox"}</p>
      </div>
    ) },
    { key: "status", header: "Status", render: (job) => <Badge status={job.status} /> },
    { key: "run_at", header: "Run at", render: (job) => <span className="text-[11.5px] text-[var(--muted)]">{formatDateTime(job.run_at)}</span> },
    {
      key: "attempts",
      header: "Attempts",
      render: (job) => (
        <span className={job.attempts > 0 ? "text-amber-300 text-[11.5px]" : "text-[11.5px] text-[var(--muted)]"}>
          {job.attempts}/{job.max_attempts}
        </span>
      ),
    },
    { key: "channel", header: "Channel", render: (job) => <span className="badge">{job.channel}</span> },
    {
      key: "error",
      header: "Last error",
      render: (job) =>
        job.last_error ? (
          <span className="line-clamp-2 max-w-[240px] text-[10.5px] text-rose-300">{job.last_error}</span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (job) => (
        <div className="flex items-center justify-end gap-1">
          {["failed", "dead", "canceled"].includes(job.status) && canPublish && (
            <button className="btn btn-sm" onClick={() => act("retry", job.id)} disabled={busy === job.id}>
              <RotateCcw size={11} /> Retry
            </button>
          )}
          {["queued", "running", "failed"].includes(job.status) && canPublish && (
            <button className="btn btn-sm btn-danger" onClick={() => act("cancel", job.id)} disabled={busy === job.id}>
              <X size={11} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Queued" value={String(health?.queued ?? 0)} hint={health?.nextRun ? `next ${formatDateTime(health.nextRun)}` : "nothing due"} icon={<Loader2 size={14} />} />
        <StatCard label="Running" value={String(health?.running ?? 0)} hint="claimed by a worker" icon={<RefreshCw size={14} />} />
        <StatCard label="Succeeded" value={String(health?.succeeded ?? 0)} hint="delivered or simulated" icon={<Zap size={14} />} />
        <StatCard label="Failed" value={String(health?.failed ?? 0)} hint="retry available" icon={<AlertTriangle size={14} />} />
        <StatCard label="Dead letter" value={String(health?.dead ?? 0)} hint="attempts exhausted" icon={<AlertTriangle size={14} />} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Publishing queue</p>
            <p className="text-[11.5px] text-[var(--muted)]">
              {health?.paused ? "Queue is paused — queued jobs will not run." : "Queue is running. Jobs survive restarts."} Auto-refresh {autoRefresh ? "on" : "off"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select className="select h-8 w-auto text-[11.5px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {["all", "active", "queued", "running", "succeeded", "failed", "dead", "canceled"].map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setAutoRefresh((v) => !v)}>{autoRefresh ? "Pause refresh" : "Resume refresh"}</button>
            <button className="btn btn-sm" onClick={() => act("tick")} disabled={busy === "tick"}>
              <Zap size={12} /> Run worker tick
            </button>
            <button className="btn btn-sm" onClick={() => act(health?.paused ? "resume" : "pause")} disabled={!canPublish}>
              {health?.paused ? <Play size={12} /> : <Pause size={12} />} {health?.paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
        {error && <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-200">{error}</div>}
        <DataTable
          columns={columns}
          rows={filtered}
          loading={loading}
          searchValue={search}
          onSearch={setSearch}
          searchPlaceholder="Search jobs by post title…"
          rowId={(job) => job.id}
          empty={<EmptyState title="Queue is empty" description="Schedule an approved post and it will appear here with a persisted job record." />}
        />
      </Card>

      <Card>
        <SectionHeader title="How delivery works" description="Facts about this deployment's publishing path." />
        <ul className="mt-2 space-y-1.5 text-[11.5px] text-[var(--muted)]">
          <li>• Jobs are stored in <span className="font-mono text-[var(--fg)]">publishing_jobs</span> with an idempotency key of post + account + run time, so a duplicate schedule cannot create a second delivery.</li>
          <li>• Failed attempts back off exponentially (1, 5, 15, 60, 240 minutes) and move to the dead-letter state after 5 attempts.</li>
          <li>• Meta rate-limit codes (4, 17, 32, 613) requeue without consuming the attempt budget.</li>
          <li>• Accounts without a live token deliver in <span className="font-semibold">sandbox</span> mode: the post is marked published with channel sandbox and no external id. Nothing reaches Meta.</li>
        </ul>
      </Card>
    </div>
  );
}
