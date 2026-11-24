import Link from "next/link";
import { all, get } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { SchedulerClient } from "@/components/scheduler-client";
import { Banner, Card, PageHeader, SectionHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function SchedulerPage() {
  const ctx = await requirePermission("content.publish");
  const jobs = all<{ id: string; status: string; run_at: string; post_title: string; platform: string }>(
    `SELECT j.id, j.status, j.run_at, p.title AS post_title, j.platform
       FROM publishing_jobs j JOIN social_posts p ON p.id = j.post_id
      WHERE j.workspace_id = ? AND j.status IN ('queued','running') ORDER BY j.run_at ASC LIMIT 8`,
    [ctx.workspace.id],
  );
  const paused = get<{ is_paused: number }>("SELECT is_paused FROM queue_state WHERE workspace_id = ?", [ctx.workspace.id]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Publish"
        title="Social Scheduler"
        description="Turn approved work into durable delivery jobs. Publish now, schedule, reschedule or cancel — everything is persisted server-side."
        actions={<Link href="/publishing-queue" className="btn btn-sm">Open queue</Link>}
      />
      {paused?.is_paused ? (
        <Banner tone="warning" title="Queue is paused">
          Scheduled jobs will not execute until you resume the queue in the Publishing Queue.
        </Banner>
      ) : null}
      <SchedulerClient canPublish={hasPermission(ctx, "content.publish")} />
      <Card>
        <SectionHeader title="Next jobs in the queue" description="Live view of the worker's next work items." />
        <div className="mt-2 space-y-1.5">
          {jobs.length === 0 && <p className="text-[12px] text-[var(--muted)]">No pending jobs.</p>}
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5 text-[11.5px]">
              <span className="truncate">{job.post_title}</span>
              <span className="shrink-0 text-[var(--muted)]">{formatDateTime(job.run_at)} · {job.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
