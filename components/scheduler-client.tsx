"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Rocket, X } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Card, EmptyState, PlatformDot, SectionHeader, Banner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { formatDateTime, label } from "@/lib/utils";

type Post = {
  id: string;
  title: string;
  status: string;
  platform: string;
  content_type: string;
  client_name: string | null;
  scheduled_at: string | null;
  caption: string | null;
  media_count: number;
  pending_approvals: number;
  publish_channel: string | null;
};

export function SchedulerClient({ canPublish }: { canPublish: boolean }) {
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Post | null>(null);
  const [when, setWhen] = useState("");
  const [channel, setChannel] = useState<"auto" | "sandbox">("sandbox");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ rows: Post[] }>("/api/v1/posts?status=approved,scheduled&limit=200");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPosts(res.data.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (post: Post) => {
    setActive(post);
    const base = post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 3600_000);
    setWhen(new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setChannel("sandbox");
  };

  const submit = async (action: "schedule" | "publish_now") => {
    if (!active) return;
    setBusy(true);
    const res = await api<{ channel: string; duplicate: boolean; validation?: { warnings: string[] } }>(
      `/api/v1/posts/${active.id}/actions`,
      {
        method: "POST",
        json: {
          action,
          scheduledAt: action === "schedule" ? new Date(when).toISOString() : undefined,
          channel,
        },
      },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error("Pre-flight failed", `${res.error} ${errorList(res.details).join(" · ")}`);
      return;
    }
    const data = res.data;
    toast.success(
      action === "schedule" ? "Scheduled" : "Queued for immediate delivery",
      `${data.channel === "live" ? "Live Meta delivery" : "Sandbox delivery"}${data.duplicate ? " · job already existed" : ""}`,
    );
    setActive(null);
    await load();
  };

  const cancel = async (post: Post) => {
    if (!window.confirm(`Cancel the scheduled delivery for “${post.title}”?`)) return;
    const res = await api(`/api/v1/posts/${post.id}/actions`, { method: "POST", json: { action: "unschedule" } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Schedule canceled");
    await load();
  };

  const ready = posts.filter((post) => post.status === "approved");
  const scheduled = posts.filter((post) => post.status === "scheduled");

  return (
    <div className="space-y-4">
      {error && <Banner tone="danger" title="Could not load">{error}</Banner>}

      <Card>
        <SectionHeader
          title={`Ready to schedule (${ready.length})`}
          description="Approved posts with no pending approval stage. Pre-flight validation runs server-side before a job is created."
        />
        {loading ? (
          <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : ready.length === 0 ? (
          <EmptyState title="Nothing awaiting scheduling" description="Approve a post in the Approvals Center, then it appears here." />
        ) : (
          <div className="mt-3 space-y-2">
            {ready.map((post) => (
              <div key={post.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="min-w-0">
                  <Link href={`/content-studio?post=${post.id}`} className="text-[12.5px] font-medium hover:underline">{post.title}</Link>
                  <p className="text-[10.5px] text-[var(--muted)]">
                    {post.client_name ?? "No client"} · {label(post.content_type)} · {post.media_count} asset(s)
                    {!post.caption && " · no caption (will fail validation)"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PlatformDot platform={post.platform} />
                  <button className="btn btn-primary btn-sm" onClick={() => open(post)} disabled={!canPublish}>
                    <Clock size={12} /> Schedule
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title={`Scheduled (${scheduled.length})`} description="A queued job exists for each of these. Cancel to move them back to approved." />
        {scheduled.length === 0 ? (
          <EmptyState title="No scheduled posts" description="Schedule an approved post to create a persistent publishing job." />
        ) : (
          <div className="mt-3 space-y-2">
            {scheduled.map((post) => (
              <div key={post.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="min-w-0">
                  <Link href={`/content-studio?post=${post.id}`} className="text-[12.5px] font-medium hover:underline">{post.title}</Link>
                  <p className="text-[10.5px] text-[var(--muted)]">
                    {post.scheduled_at ? formatDateTime(post.scheduled_at) : "time not set"} · {post.client_name ?? "No client"} · channel {post.publish_channel ?? "pending"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={post.status} />
                  <button className="btn btn-sm" onClick={() => open(post)} disabled={!canPublish}>Move</button>
                  <button className="btn btn-sm btn-danger" onClick={() => cancel(post)} disabled={!canPublish} aria-label="Cancel schedule">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Schedule “${active.title}”` : "Schedule"}
        description="Validation runs before the job is persisted: caption length, approval state, media requirements and account platform support."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setActive(null)}>Cancel</button>
            <button className="btn btn-sm" onClick={() => submit("publish_now")} disabled={busy || !canPublish}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Publish now
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => submit("schedule")} disabled={busy || !canPublish || !when}>
              <Clock size={12} /> Schedule
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Delivery time (your local time)</label>
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
            <p className="mt-1 text-[10.5px] text-[var(--muted)]">Stored as UTC — timezone-aware execution runs in the worker.</p>
          </div>
          <div>
            <label className="label">Channel</label>
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as "auto" | "sandbox")}>
              <option value="auto">Auto — live if the account holds a valid Meta token</option>
              <option value="sandbox">Sandbox — simulate delivery, never call Meta</option>
            </select>
          </div>
          <Banner tone="warning" title="Sandbox means simulated">
            Sandbox jobs are recorded as published with channel=sandbox and no external id. Only a live Meta account with an
            approved app can create a real post.
          </Banner>
        </div>
      </Modal>
    </div>
  );
}
