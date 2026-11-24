import { requirePermission, hasPermission } from "@/lib/auth";
import { QueueClient } from "@/components/queue-client";
import { Banner, PageHeader } from "@/components/ui";

export default async function PublishingQueuePage() {
  const ctx = await requirePermission("content.publish");
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Publish"
        title="Publishing Queue"
        description="Every delivery attempt is persisted. Retry, cancel, reschedule and pause the queue — no browser tab is required for jobs to run."
      />
      <Banner tone="info" title="Worker status">
        The in-process scheduler runs every{" "}
        {process.env.SCHEDULER_INTERVAL_SECONDS ?? 20}s while the app server is up; a standalone worker service can poll the same
        endpoint with WORKER_SECRET. Use “Run worker tick” to process due jobs immediately.
      </Banner>
      <QueueClient canPublish={hasPermission(ctx, "content.publish")} />
    </div>
  );
}
