"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO, startOfWeek, addWeeks } from "date-fns";
import { GripVertical, Plus, Search } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Card, EmptyState, PlatformDot, Progress } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, formatDate, formatDateTime, label } from "@/lib/utils";

type PlannerPost = {
  id: string;
  title: string;
  status: string;
  platform: string;
  content_type: string;
  client_id: string | null;
  client_name: string | null;
  campaign_id: string | null;
  scheduled_at: string | null;
  deadline: string | null;
  priority: string;
  writer_name: string | null;
  designer_name: string | null;
  reviewer_name: string | null;
  media_count: number;
  pending_approvals: number;
  approval_total: number;
  comment_count: number;
};

const COLUMNS = [
  "idea",
  "planned",
  "draft",
  "in_creation",
  "review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "failed",
];

export function PlannerBoard({ initialPosts, canWrite }: { initialPosts: PlannerPost[]; canWrite: boolean }) {
  const toast = useToast();
  const [posts, setPosts] = useState(initialPosts);
  const [view, setView] = useState<"kanban" | "table" | "timeline">("kanban");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const clients = useMemo(
    () => Array.from(new Map(posts.filter((p) => p.client_id).map((p) => [p.client_id!, p.client_name ?? "Client"])).entries()),
    [posts],
  );

  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        if (clientFilter && post.client_id !== clientFilter) return false;
        if (search && !post.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [posts, search, clientFilter],
  );

  const move = async (postId: string, status: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === status) return;
    setBusy(postId);
    const res = await api(`/api/v1/posts/${postId}/actions`, { method: "POST", json: { action: "set_status", status } });
    setBusy(null);
    if (!res.ok) {
      toast.error("Status change rejected", `${res.error} ${errorList(res.details).join(" ")}`);
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status } : p)));
    toast.success(`Moved to ${label(status)}`);
  };

  const grouped = useMemo(() => {
    const map: Record<string, PlannerPost[]> = {};
    for (const column of COLUMNS) map[column] = [];
    for (const post of filtered) {
      (map[post.status] ??= []).push(post);
    }
    return map;
  }, [filtered]);

  const weeks = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = addWeeks(start, index);
      const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
      return {
        weekStart,
        weekEnd,
        posts: filtered.filter((post) => {
          const raw = post.scheduled_at ?? post.deadline;
          if (!raw) return false;
          const date = new Date(raw);
          return date >= weekStart && date < new Date(weekEnd.getTime() + 86400000);
        }),
      };
    });
  }, [filtered]);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-0.5">
            {(["kanban", "table", "timeline"] as const).map((option) => (
              <button key={option} className="chip !border-0 !bg-transparent !py-1 capitalize" data-active={view === option} onClick={() => setView(option)}>
                {option}
              </button>
            ))}
          </div>
          <div className="relative min-w-[190px] flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input h-8 pl-8 text-[12px]" placeholder="Search posts…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select h-8 w-auto text-[12px]" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <Link href="/content-studio?new=1" className="btn btn-primary btn-sm">
            <Plus size={12} /> New post
          </Link>
        </div>
      </Card>

      {view === "kanban" && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {COLUMNS.map((column) => (
            <div
              key={column}
              className={cn("w-[248px] shrink-0 rounded-xl border border-[var(--line)] bg-[var(--card-2)]/60 p-2", overColumn === column && "drop-target")}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(column);
              }}
              onDragLeave={() => setOverColumn((prev) => (prev === column ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                setOverColumn(null);
                if (dragId) void move(dragId, column);
                setDragId(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11.5px] font-semibold">{label(column)}</p>
                <span className="badge !py-0 !text-[9.5px]">{grouped[column]?.length ?? 0}</span>
              </div>
              <div className="space-y-1.5 min-h-[80px]">
                {(grouped[column] ?? []).map((post) => (
                  <div
                    key={post.id}
                    draggable={canWrite}
                    onDragStart={() => setDragId(post.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn("rounded-lg border border-[var(--line)] bg-[var(--card)] p-2 hover:border-[var(--line-strong)]", busy === post.id && "opacity-60")}
                  >
                    <div className="flex items-start gap-1">
                      {canWrite && <GripVertical size={11} className="mt-0.5 shrink-0 text-[var(--muted)]" />}
                      <Link href={`/content-studio?post=${post.id}`} className="line-clamp-2 text-[11.5px] font-medium leading-snug hover:underline">
                        {post.title}
                      </Link>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9.5px] text-[var(--muted)]">
                      <span className="truncate">{post.client_name ?? "No client"}</span>
                      <Badge status={post.priority} className="!px-1.5 !py-0 !text-[9px]" />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9.5px] text-[var(--muted)]">
                      <PlatformDot platform={post.platform} />
                      <span>{post.scheduled_at ? formatDate(post.scheduled_at) : post.deadline ? `due ${formatDate(post.deadline)}` : "no date"}</span>
                    </div>
                    {(post.pending_approvals > 0 || post.comment_count > 0) && (
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--muted)]">
                        {post.pending_approvals > 0 && <span className="text-amber-400">{post.pending_approvals} pending</span>}
                        {post.comment_count > 0 && <span>{post.comment_count} comments</span>}
                      </div>
                    )}
                  </div>
                ))}
                {(grouped[column] ?? []).length === 0 && <p className="px-1 py-3 text-[10px] text-[var(--muted)]">Nothing here</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "table" && (
        <Card className="p-0 overflow-hidden">
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  {["Post", "Brand", "Platform", "Type", "Status", "Publish / due", "Assignees", "Approvals", "Media"].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link href={`/content-studio?post=${post.id}`} className="font-medium hover:underline">{post.title}</Link>
                    </td>
                    <td className="text-[var(--muted)]">{post.client_name ?? "—"}</td>
                    <td><PlatformDot platform={post.platform} /></td>
                    <td className="text-[var(--muted)]">{label(post.content_type)}</td>
                    <td><Badge status={post.status} /></td>
                    <td className="text-[var(--muted)]">{post.scheduled_at ? formatDateTime(post.scheduled_at) : post.deadline ? `due ${formatDate(post.deadline)}` : "—"}</td>
                    <td className="text-[11px] text-[var(--muted)]">
                      {[post.writer_name, post.designer_name, post.reviewer_name].filter(Boolean).join(" · ") || "unassigned"}
                    </td>
                    <td className="text-[11px]">
                      {post.approval_total === 0 ? (
                        <span className="text-[var(--muted)]">none</span>
                      ) : (
                        <span className={post.pending_approvals > 0 ? "text-amber-400" : "text-emerald-400"}>
                          {post.approval_total - post.pending_approvals}/{post.approval_total}
                        </span>
                      )}
                    </td>
                    <td className="text-[11px] text-[var(--muted)]">{post.media_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <EmptyState title="No posts" description="Create a post to see it here." />}
        </Card>
      )}

      {view === "timeline" && (
        <div className="space-y-2">
          {weeks.map((week) => (
            <Card key={week.weekStart.toISOString()} className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold">{format(week.weekStart, "MMM d")} – {format(week.weekEnd, "MMM d")}</p>
                <span className="text-[10.5px] text-[var(--muted)]">{week.posts.length} post(s)</span>
              </div>
              {week.posts.length === 0 ? (
                <p className="mt-1 text-[11px] text-[var(--muted)]">No dates in this week.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {week.posts.map((post) => {
                    const start = post.scheduled_at ?? post.deadline;
                    const dayOffset = start ? Math.max(0, Math.min(6, Math.floor((new Date(start).getTime() - week.weekStart.getTime()) / 86400000))) : 0;
                    return (
                      <div key={post.id} className="flex items-center gap-2">
                        <div className="w-[150px] shrink-0 truncate text-[11px]">
                          <Link href={`/content-studio?post=${post.id}`} className="hover:underline">{post.title}</Link>
                        </div>
                        <div className="relative h-5 flex-1 rounded bg-[var(--card-2)]">
                          <div
                            className="absolute top-0 h-5 rounded px-1.5 text-[9px] leading-5 text-white"
                            style={{
                              left: `${(dayOffset / 7) * 100}%`,
                              width: `${(1 / 7) * 100}%`,
                              background: post.status === "scheduled" ? "#1677FF" : post.status === "approved" ? "#10B981" : "#8B5CF6",
                            }}
                            title={`${label(post.status)} · ${start ? format(parseISO(start), "MMM d HH:mm") : "no date"}`}
                          />
                        </div>
                        <Badge status={post.status} />
                      </div>
                    );
                  })}
                </div>
              )}
              <Progress value={(week.posts.length / Math.max(1, Math.max(...weeks.map((w) => w.posts.length)))) * 100} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
