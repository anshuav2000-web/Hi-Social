"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Sparkles } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Banner, Card, PlatformDot } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { cn, CONTENT_TYPES, label, PLATFORMS } from "@/lib/utils";

type CalendarPost = {
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
  content_pillar: string | null;
  assigned_writer_id: string | null;
  assigned_designer_id: string | null;
  reviewer_id: string | null;
  media_count: number;
  pending_approvals: number;
};

type Lookups = {
  clients: { id: string; name: string }[];
  users: { id: string; full_name: string }[];
  campaigns: { id: string; name: string }[];
};

const VIEWS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
  { key: "agenda", label: "Agenda" },
] as const;

export function CalendarBoard({
  initialPosts,
  lookups,
  canWrite,
  canPublish,
  holidays,
}: {
  initialPosts: CalendarPost[];
  lookups: Lookups;
  canWrite: boolean;
  canPublish: boolean;
  holidays: string[];
}) {
  const toast = useToast();
  const [posts, setPosts] = useState<CalendarPost[]>(initialPosts);
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("month");
  const [cursor, setCursor] = useState(new Date());
  const [filters, setFilters] = useState({ platform: "", client_id: "", campaign_id: "", status: "" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [planDate, setPlanDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    title: "",
    platform: "instagram",
    content_type: "image",
    client_id: lookups.clients[0]?.id ?? "",
    campaign_id: "",
    pillar: "",
    brief: "",
    writer: "",
    designer: "",
    reviewer: "",
    time: "09:00",
    deadline: "",
  });

  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        if (filters.platform && post.platform !== filters.platform) return false;
        if (filters.client_id && post.client_id !== filters.client_id) return false;
        if (filters.campaign_id && post.campaign_id !== filters.campaign_id) return false;
        if (filters.status && post.status !== filters.status) return false;
        return true;
      }),
    [posts, filters],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of filtered) {
      const key = post.scheduled_at ? post.scheduled_at.slice(0, 10) : "unscheduled";
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [filtered]);

  const reschedule = async (postId: string, dateKey: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const time = post.scheduled_at ? format(parseISO(post.scheduled_at), "HH:mm") : "09:00";
    const runAt = `${dateKey}T${time}:00.000Z`;
    setBusy(true);
    setBanner(null);

    const mustQueue = canPublish && ["approved", "scheduled"].includes(post.status);
    const res = mustQueue
      ? await api(`/api/v1/posts/${postId}/actions`, { method: "POST", json: { action: "schedule", scheduledAt: runAt, channel: "sandbox" } })
      : await api(`/api/v1/posts/${postId}`, { method: "PATCH", json: { scheduled_at: runAt } });
    setBusy(false);

    if (!res.ok) {
      setBanner(`${res.error}${errorList(res.details).map((d) => ` · ${d}`).join("")}`);
      toast.error("Could not reschedule", res.error);
      return;
    }
    setPosts((prev) =>
      prev.map((item) =>
        item.id === postId
          ? { ...item, scheduled_at: runAt, status: mustQueue ? "scheduled" : item.status === "draft" ? "planned" : item.status }
          : item,
      ),
    );
    toast.success(
      mustQueue ? "Rescheduled and queued" : "Planned date updated",
      mustQueue ? "The previous pending job was superseded." : "No publishing job was created.",
    );
  };

  const createPlan = async () => {
    if (!planDate) return;
    setBusy(true);
    const runAt = `${planDate}T${draft.time}:00.000Z`;
    const res = await api<{ post: { id: string } }>("/api/v1/posts", {
      method: "POST",
      json: {
        title: draft.title.trim() || "Untitled plan",
        platform: draft.platform,
        content_type: draft.content_type,
        client_id: draft.client_id || null,
        campaign_id: draft.campaign_id || null,
        content_pillar: draft.pillar || null,
        brief: draft.brief || null,
        assigned_writer_id: draft.writer || null,
        assigned_designer_id: draft.designer || null,
        reviewer_id: draft.reviewer || null,
        deadline: draft.deadline ? new Date(`${draft.deadline}T17:00:00.000Z`).toISOString() : null,
        scheduled_at: runAt,
        status: "planned",
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    const post = res.data.post;
    setPosts((prev) => [
      {
        id: post.id,
        title: draft.title || "Untitled plan",
        status: "planned",
        platform: draft.platform,
        content_type: draft.content_type,
        client_id: draft.client_id || null,
        client_name: lookups.clients.find((c) => c.id === draft.client_id)?.name ?? null,
        campaign_id: draft.campaign_id || null,
        scheduled_at: runAt,
        deadline: draft.deadline || null,
        content_pillar: draft.pillar || null,
        assigned_writer_id: draft.writer || null,
        assigned_designer_id: draft.designer || null,
        reviewer_id: draft.reviewer || null,
        media_count: 0,
        pending_approvals: 0,
      },
      ...prev,
    ]);
    toast.success("Content planned", "No publishing job was created — this is a planning slot.");
    setPlanDate(null);
    setDraft({ ...draft, title: "", brief: "", pillar: "" });
  };

  const shift = (direction: -1 | 1) => {
    setCursor((prev) =>
      view === "month" ? addMonths(prev, direction) : view === "week" ? addWeeks(prev, direction) : addDays(prev, direction),
    );
  };

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const unscheduled = byDate.get("unscheduled") ?? [];

  const renderChip = (post: CalendarPost) => (
    <div
      key={post.id}
      draggable={canWrite}
      onDragStart={() => setDragId(post.id)}
      onDragEnd={() => setDragId(null)}
      className={cn(
        "group cursor-grab rounded-md border border-[var(--line)] bg-[var(--card-3)] px-1.5 py-1 text-[10.5px] leading-tight hover:border-[var(--brand)]",
      )}
      title={`${post.title} · ${label(post.status)}`}
    >
      <div className="flex items-center gap-1">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: post.platform === "instagram" ? "#E1306C" : post.platform === "facebook" ? "#1877F2" : "#9AA9BC" }}
        />
        <Link href={`/content-studio?post=${post.id}`} className="truncate hover:underline">
          {post.title}
        </Link>
        {post.pending_approvals > 0 && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
      </div>
      <p className="truncate text-[9.5px] text-[var(--muted)]">
        {post.scheduled_at ? format(parseISO(post.scheduled_at), "HH:mm") : "unscheduled"} · {label(post.status)}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {banner && <Banner tone="danger" title="Reschedule blocked">{banner}</Banner>}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button className="btn btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft size={14} /></button>
            <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Today</button>
            <button className="btn btn-sm btn-icon" onClick={() => shift(1)} aria-label="Next"><ChevronRight size={14} /></button>
          </div>
          <p className="text-[14px] font-semibold min-w-[150px]">
            {view === "month"
              ? format(cursor, "MMMM yyyy")
              : view === "week"
                ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
                : view === "day"
                  ? format(cursor, "EEEE, MMM d, yyyy")
                  : "Next 30 days"}
          </p>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-0.5">
            {VIEWS.map((option) => (
              <button key={option.key} className="chip !border-0 !bg-transparent !py-1" data-active={view === option.key} onClick={() => setView(option.key)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <select className="select h-8 w-auto text-[11.5px]" value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })}>
              <option value="">All platforms</option>
              {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <select className="select h-8 w-auto text-[11.5px]" value={filters.client_id} onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}>
              <option value="">All clients</option>
              {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="select h-8 w-auto text-[11.5px]" value={filters.campaign_id} onChange={(e) => setFilters({ ...filters, campaign_id: e.target.value })}>
              <option value="">All campaigns</option>
              {lookups.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="select h-8 w-auto text-[11.5px]" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {["idea", "planned", "draft", "in_creation", "review", "changes_requested", "approved", "scheduled", "published", "failed"].map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
            {canWrite && (
              <button className="btn btn-primary btn-sm" onClick={() => setPlanDate(format(cursor, "yyyy-MM-dd"))}>
                <Plus size={12} /> Plan
              </button>
            )}
          </div>
        </div>
      </Card>

      {view === "month" && (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--card-2)]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayPosts = byDate.get(key) ?? [];
              const isToday = isSameDay(day, new Date());
              const inMonth = isSameMonth(day, cursor);
              const holiday = holidays.includes(key);
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverDay(key);
                  }}
                  onDragLeave={() => setOverDay((prev) => (prev === key ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverDay(null);
                    if (dragId) void reschedule(dragId, key);
                    setDragId(null);
                  }}
                  onDoubleClick={() => canWrite && setPlanDate(key)}
                  className={cn(
                    "min-h-[112px] border-b border-r border-[var(--line)] p-1.5 align-top",
                    !inMonth && "opacity-45",
                    overDay === key && "drop-target",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10.5px]", isToday && "bg-[var(--brand)] font-semibold text-white")}>
                      {format(day, "d")}
                    </span>
                    {holiday && <span className="text-[8.5px] uppercase text-amber-400">holiday</span>}
                    {canWrite && (
                      <button className="text-[var(--muted)] opacity-0 hover:text-[var(--fg)] group-hover:opacity-100" onClick={() => setPlanDate(key)} aria-label="Plan on this day">
                        <Plus size={10} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map(renderChip)}
                    {dayPosts.length > 3 && (
                      <button className="text-[9.5px] text-[var(--accent)]" onClick={() => { setCursor(day); setView("day"); }}>
                        +{dayPosts.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayPosts = byDate.get(key) ?? [];
            return (
              <Card
                key={key}
                className={cn("p-2.5 min-h-[220px]", isSameDay(day, new Date()) && "border-[var(--brand)]/50")}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11.5px] font-semibold">{format(day, "EEE d")}</p>
                  {canWrite && (
                    <button className="text-[var(--muted)] hover:text-[var(--fg)]" onClick={() => setPlanDate(key)} aria-label="Plan">
                      <Plus size={11} />
                    </button>
                  )}
                </div>
                <div
                  className="space-y-1 min-h-[150px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) void reschedule(dragId, key);
                    setDragId(null);
                  }}
                >
                  {dayPosts.length === 0 && <p className="text-[10px] text-[var(--muted)]">—</p>}
                  {dayPosts.map(renderChip)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === "day" && (
        <Card>
          <div className="space-y-2">
            {(byDate.get(format(cursor, "yyyy-MM-dd")) ?? []).length === 0 && (
              <p className="text-[12px] text-[var(--muted)]">Nothing planned for this day.</p>
            )}
            {(byDate.get(format(cursor, "yyyy-MM-dd")) ?? []).map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="min-w-0">
                  <Link href={`/content-studio?post=${post.id}`} className="text-[12.5px] font-medium hover:underline">{post.title}</Link>
                  <p className="text-[10.5px] text-[var(--muted)]">
                    {post.scheduled_at ? format(parseISO(post.scheduled_at), "HH:mm") : "unscheduled"} · {post.client_name ?? "No client"} · {label(post.content_type)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PlatformDot platform={post.platform} />
                  <Badge status={post.status} />
                </div>
              </div>
            ))}
            {canWrite && (
              <button className="btn btn-sm" onClick={() => setPlanDate(format(cursor, "yyyy-MM-dd"))}>
                <Plus size={12} /> Plan content for this day
              </button>
            )}
          </div>
        </Card>
      )}

      {view === "agenda" && (
        <Card>
          <div className="space-y-3">
            {Array.from({ length: 30 }, (_, index) => addDays(new Date(), index)).map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayPosts = byDate.get(key) ?? [];
              if (dayPosts.length === 0) return null;
              return (
                <div key={key}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {format(day, "EEE d MMM")} {holidays.includes(key) && <span className="text-amber-400">· holiday</span>}
                  </p>
                  <div className="mt-1 space-y-1">
                    {dayPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5">
                        <Link href={`/content-studio?post=${post.id}`} className="min-w-0 truncate text-[12px] hover:underline">{post.title}</Link>
                        <div className="flex shrink-0 items-center gap-2 text-[10.5px] text-[var(--muted)]">
                          <span className="flex items-center gap-1"><Clock size={10} />{post.scheduled_at ? format(parseISO(post.scheduled_at), "HH:mm") : "—"}</span>
                          <Badge status={post.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-[var(--muted)]">Agenda shows scheduled and planned content for the next 30 days that matches your filters.</p>
          </div>
        </Card>
      )}

      {unscheduled.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold">Unscheduled backlog ({unscheduled.length})</p>
            <span className="text-[10.5px] text-[var(--muted)]">Drag onto a day, or open the post</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unscheduled.slice(0, 24).map((post) => (
              <span
                key={post.id}
                draggable={canWrite}
                onDragStart={() => setDragId(post.id)}
                onDragEnd={() => setDragId(null)}
                className="chip cursor-grab"
              >
                <Sparkles size={10} /> {post.title}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={planDate !== null}
        onClose={() => setPlanDate(null)}
        title="Plan content"
        description={planDate ? `Planning slot for ${planDate}. A plan does not need a caption or creative.` : undefined}
        size="lg"
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setPlanDate(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={createPlan} disabled={busy}>
              {busy ? "Saving…" : "Create plan"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Post title</label>
            <input className="input" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What is this piece about?" />
          </div>
          <div>
            <label className="label">Client</label>
            <select className="select" value={draft.client_id} onChange={(e) => setDraft({ ...draft, client_id: e.target.value })}>
              <option value="">— none —</option>
              {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Campaign</label>
            <select className="select" value={draft.campaign_id} onChange={(e) => setDraft({ ...draft, campaign_id: e.target.value })}>
              <option value="">— none —</option>
              {lookups.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Platform</label>
            <select className="select" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Content type</label>
            <select className="select" value={draft.content_type} onChange={(e) => setDraft({ ...draft, content_type: e.target.value })}>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Content pillar</label>
            <input className="input" value={draft.pillar} onChange={(e) => setDraft({ ...draft, pillar: e.target.value })} placeholder="Product, Education…" />
          </div>
          <div>
            <label className="label">Planned time (UTC)</label>
            <input type="time" className="input" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Content idea / brief</label>
            <textarea className="textarea" rows={2} value={draft.brief} onChange={(e) => setDraft({ ...draft, brief: e.target.value })} placeholder="Angle, key message, references…" />
          </div>
          <div>
            <label className="label">Assigned writer</label>
            <select className="select" value={draft.writer} onChange={(e) => setDraft({ ...draft, writer: e.target.value })}>
              <option value="">— unassigned —</option>
              {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigned designer</label>
            <select className="select" value={draft.designer} onChange={(e) => setDraft({ ...draft, designer: e.target.value })}>
              <option value="">— unassigned —</option>
              {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reviewer</label>
            <select className="select" value={draft.reviewer} onChange={(e) => setDraft({ ...draft, reviewer: e.target.value })}>
              <option value="">— unassigned —</option>
              {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Deadline</label>
            <input type="date" className="input" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
