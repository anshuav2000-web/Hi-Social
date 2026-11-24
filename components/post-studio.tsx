"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  Rocket,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Card, Badge, EmptyState, PlatformDot, Progress, Avatar, Banner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { cn, CONTENT_TYPES, formatDate, formatDateTime, label, PLATFORMS, POST_STATUSES } from "@/lib/utils";

type Lookups = {
  clients: { id: string; name: string }[];
  users: { id: string; full_name: string }[];
  campaigns: { id: string; name: string }[];
  posts: { id: string; title: string }[];
};

type PostSummary = {
  id: string;
  title: string;
  status: string;
  platform: string;
  content_type: string;
  client_name: string | null;
  scheduled_at: string | null;
  updated_at: string;
  pending_approvals: number;
  media_count: number;
  publish_channel: string | null;
};

type MediaAsset = { id: string; name: string; url: string | null; mime_type: string; kind: string; width: number | null; height: number | null };

type Detail = {
  post: Record<string, any>;
  media: Record<string, any>[];
  brief: Record<string, any> | null;
  versions: Record<string, any>[];
  comments: Record<string, any>[];
  approvals: Record<string, any>[];
  jobs: Record<string, any>[];
  published: Record<string, any>[];
};

const FORM_KEYS = [
  "title", "client_id", "campaign_id", "platform", "content_type", "content_pillar", "caption", "hashtags", "cta",
  "alt_text", "first_comment", "location_name", "internal_notes", "priority", "deadline", "timezone", "scheduled_at",
  "assigned_writer_id", "assigned_designer_id", "reviewer_id",
] as const;

const BRIEF_KEYS = ["brief", "creative_requirements", "target_audience", "reference_files"] as const;

type Form = Record<string, any>;

const emptyForm = (): Form => ({
  title: "",
  client_id: null,
  campaign_id: null,
  platform: "instagram",
  content_type: "image",
  content_pillar: "",
  caption: "",
  hashtags: "",
  cta: "",
  alt_text: "",
  first_comment: "",
  location_name: "",
  internal_notes: "",
  priority: "medium",
  deadline: null,
  timezone: "UTC",
  scheduled_at: null,
  assigned_writer_id: null,
  assigned_designer_id: null,
  reviewer_id: null,
  brief: "",
  creative_requirements: "",
  target_audience: "",
  reference_files: "",
});

export function PostStudio({
  initialPosts,
  lookups,
  media,
  canWrite,
  canPublish,
  canApprove,
  initialPostId,
  initialNew,
  initialCampaign,
}: {
  initialPosts: PostSummary[];
  lookups: Lookups;
  media: MediaAsset[];
  canWrite: boolean;
  canPublish: boolean;
  canApprove: boolean;
  initialPostId?: string;
  initialNew?: boolean;
  initialCampaign?: string;
}) {
  const toast = useToast();
  const [posts, setPosts] = useState<PostSummary[]>(initialPosts);
  const [selectedId, setSelectedId] = useState<string | null>(initialPostId ?? initialPosts[0]?.id ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [loading, setLoading] = useState(Boolean(initialPostId ?? initialPosts[0]?.id));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<"content" | "brief" | "media" | "approvals" | "comments" | "versions" | "publishing">("content");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [newOpen, setNewOpen] = useState(Boolean(initialNew));
  const [newPost, setNewPost] = useState({ title: "", platform: "instagram", content_type: "image", client_id: lookups.clients[0]?.id ?? "", campaign_id: initialCampaign ?? "" });
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState("caption");
  const [aiTone, setAiTone] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [channel, setChannel] = useState<"auto" | "sandbox">("sandbox");
  const [comment, setComment] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const refreshList = useCallback(async () => {
    const res = await api<{ rows: PostSummary[] }>("/api/v1/posts?limit=200");
    if (res.ok) setPosts(res.data.rows);
  }, []);

  const loadPost = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await api<Detail>(`/api/v1/posts/${id}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDetail(res.data);
    const post = res.data.post;
    const next: Form = {};
    for (const key of FORM_KEYS) next[key] = post[key] ?? (key === "timezone" ? "UTC" : key === "priority" ? "medium" : null);
    for (const key of BRIEF_KEYS) next[key] = res.data.brief?.[key] ?? "";
    next.platform = post.platform;
    next.content_type = post.content_type;
    next.title = post.title;
    setForm(next);
    setScheduleAt(post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : "");
    loadedIdRef.current = id;
    dirtyRef.current = false;
  }, []);

  useEffect(() => {
    if (selectedId) void loadPost(selectedId);
    else {
      setDetail(null);
      setForm(emptyForm());
    }
  }, [selectedId, loadPost]);

  const savePost = useCallback(
    async (silent = true) => {
      if (!selectedId || !canWrite) return;
      setSaving(true);
      const payload: Record<string, unknown> = {};
      for (const key of FORM_KEYS) {
        if (key === "title" || key === "platform" || key === "content_type") payload[key] = form[key];
        else payload[key] = form[key] === "" ? null : form[key];
      }
      for (const key of BRIEF_KEYS) payload[key] = form[key] === "" ? null : form[key];
      const res = await api(`/api/v1/posts/${selectedId}`, { method: "PATCH", json: payload });
      setSaving(false);
      if (!res.ok) {
        toast.error("Autosave failed", res.error);
        return;
      }
      dirtyRef.current = false;
      setSavedAt(Date.now());
      if (!silent) toast.success("Post saved");
      void refreshList();
    },
    [selectedId, form, canWrite, refreshList, toast],
  );

  const update = (patch: Partial<Form>) => {
    if (!canWrite) return;
    setForm((prev) => ({ ...prev, ...patch }));
    if (selectedId) {
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (dirtyRef.current) void savePost();
      }, 1400);
    }
  };

  const act = async (action: string, extra: Record<string, unknown> = {}, path?: string) => {
    if (!selectedId) return;
    setBusyAction(action);
    setError(null);
    const res = await api<Detail | Record<string, unknown>>(path ?? `/api/v1/posts/${selectedId}/actions`, {
      method: "POST",
      json: { action, ...extra },
    });
    setBusyAction(null);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error, errorList(res.details).join(" · "));
      return null;
    }
    await loadPost(selectedId);
    await refreshList();
    return res.data;
  };

  const createPost = async () => {
    setBusyAction("create");
    const res = await api<Detail>("/api/v1/posts", {
      method: "POST",
      json: {
        title: newPost.title.trim() || "Untitled post",
        platform: newPost.platform,
        content_type: newPost.content_type,
        client_id: newPost.client_id || null,
        campaign_id: newPost.campaign_id || null,
        status: "draft",
      },
    });
    setBusyAction(null);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    toast.success("Post created");
    setNewOpen(false);
    setNewPost({ title: "", platform: "instagram", content_type: "image", client_id: lookups.clients[0]?.id ?? "", campaign_id: "" });
    await refreshList();
    const id = (res.data.post as { id: string }).id;
    setSelectedId(id);
  };

  const runAi = async (mode = aiMode) => {
    setAiBusy(true);
    const res = await api<{ provider: string; text: string; note?: string }>("/api/v1/ai", {
      method: "POST",
      json: {
        mode,
        topic: `${form.title}\n\n${form.caption ?? ""}`.trim() || form.title || "content idea",
        platform: form.platform,
        contentType: form.content_type,
        tone: aiTone || undefined,
        clientId: form.client_id ?? undefined,
      },
    });
    setAiBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAiResult(res.data.text);
    toast.info(`Generated with ${res.data.provider}`, res.data.note);
  };

  const attachMedia = async (assetId: string) => {
    const data = await act("attach_media", { assetId });
    if (data) {
      setMediaPickerOpen(false);
      toast.success("Media attached");
    }
  };

  const detachMedia = async (assetId: string) => {
    const data = await act("detach_media", { assetId });
    if (data) toast.success("Media detached");
  };

  const previewMedia = detail?.media?.[0];
  const charCount = String(form.caption ?? "").length;
  const captionLimit = form.platform === "instagram" ? 2200 : 63206;

  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        if (statusFilter && post.status !== statusFilter) return false;
        if (search && !post.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [posts, statusFilter, search],
  );

  const canScheduleHere = canPublish;
  const approvalsPending = detail?.approvals?.filter((a) => a.status === "pending") ?? [];
  const allApproved = (detail?.approvals?.length ?? 0) > 0 && (detail?.approvals ?? []).every((a) => a.status === "approved");

  return (
    <div className="grid gap-4 xl:grid-cols-[268px_minmax(0,1fr)_312px]">
      {/* List */}
      <Card className="p-0 overflow-hidden h-fit xl:sticky xl:top-[72px]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
          <p className="text-[12.5px] font-semibold">Content ({filtered.length})</p>
          <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)} disabled={!canWrite}>
            <Plus size={12} /> New
          </button>
        </div>
        <div className="space-y-1.5 border-b border-[var(--line)] px-2.5 py-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input h-7 pl-7 text-[11.5px]" placeholder="Filter posts…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select h-7 text-[11.5px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {POST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-2 py-6 text-center text-[11.5px] text-[var(--muted)]">No posts match.</p>}
          {filtered.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedId(post.id)}
              className={cn(
                "w-full rounded-lg px-2 py-2 text-left transition-colors",
                selectedId === post.id ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--card-3)]",
              )}
            >
              <div className="flex items-start justify-between gap-1.5">
                <p className="line-clamp-2 text-[12px] font-medium leading-snug">{post.title}</p>
                {post.pending_approvals > 0 && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--muted)]">
                <span className="truncate">{post.client_name ?? "No client"}</span>
                <span className="badge !px-1.5 !py-0 !text-[9.5px]">{label(post.status)}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                {post.scheduled_at ? formatDateTime(post.scheduled_at) : `updated ${formatDate(post.updated_at)}`}
                {post.publish_channel === "sandbox" && " · sandbox"}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Editor */}
      <div className="space-y-3 min-w-0">
        {error && (
          <Banner tone="danger" title="Action blocked">
            {error}
          </Banner>
        )}

        {!detail && !loading && (
          <Card>
            <EmptyState
              title="Select a post to edit"
              description="Choose a post on the left, or create a new one. Planned posts do not need a final caption or creative yet."
              action={canWrite ? <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New post</button> : undefined}
            />
          </Card>
        )}

        {loading && (
          <Card>
            <div className="space-y-3">
              <div className="skeleton h-6 w-1/2" />
              <div className="skeleton h-24 w-full" />
              <div className="skeleton h-40 w-full" />
            </div>
          </Card>
        )}

        {detail && !loading && (
          <>
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full bg-transparent text-[17px] font-semibold tracking-tight outline-none"
                    value={form.title ?? ""}
                    onChange={(e) => update({ title: e.target.value })}
                    disabled={!canWrite}
                    placeholder="Post title"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                    <Badge status={detail.post.status} />
                    <PlatformDot platform={String(form.platform)} />
                    <span>{label(String(form.content_type))}</span>
                    <span>·</span>
                    <span>{detail.post.client_name ?? "No client"}</span>
                    {saving ? (
                      <span className="flex items-center gap-1 text-[var(--accent)]"><Loader2 size={10} className="animate-spin" /> saving…</span>
                    ) : savedAt ? (
                      <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={10} /> saved</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {canWrite && (
                    <button className="btn btn-sm" onClick={() => savePost(false)} disabled={saving}>
                      <Save size={12} /> Save
                    </button>
                  )}
                  {canWrite && !["review", "approved", "scheduled", "published"].includes(detail.post.status) && (
                    <button className="btn btn-sm" onClick={() => act("submit_review")} disabled={busyAction !== null}>
                      <Send size={12} /> Send for review
                    </button>
                  )}
                  {canApprove && detail.post.status === "review" && (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={async () => {
                          for (const approval of approvalsPending) {
                            await api("/api/v1/approvals", {
                              method: "POST",
                              json: { approvalId: approval.id, decision: "approved", feedback: "Approved from Content Studio" },
                            });
                          }
                          await loadPost(String(selectedId));
                          await refreshList();
                          toast.success("Approval recorded");
                        }}
                      >
                        <CheckCircle2 size={12} /> Approve stage
                      </button>
                      <button className="btn btn-sm" onClick={() => act("set_status", { status: "changes_requested" })}>
                        Request changes
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-[var(--line)] px-3 py-2">
                {[
                  { key: "content", label: "Content", icon: FileText },
                  { key: "brief", label: "Brief", icon: FileText },
                  { key: "media", label: `Media (${detail.media.length})`, icon: ImageIcon },
                  { key: "approvals", label: `Approvals (${detail.approvals.length})`, icon: CheckCircle2 },
                  { key: "comments", label: `Comments (${detail.comments.length})`, icon: MessageSquare },
                  { key: "versions", label: `Versions (${detail.versions.length})`, icon: History },
                  { key: "publishing", label: "Publishing", icon: Rocket },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key as typeof tab)}
                    className={cn("chip !border-0 !bg-transparent", tab === item.key && "!bg-[var(--card-3)] !text-[var(--fg)]")}
                  >
                    <item.icon size={12} /> {item.label}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {tab === "content" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Client</label>
                        <select className="select" value={form.client_id ?? ""} onChange={(e) => update({ client_id: e.target.value || null })} disabled={!canWrite}>
                          <option value="">— none —</option>
                          {lookups.clients.map((client) => (
                            <option key={client.id} value={client.id}>{client.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Campaign</label>
                        <select className="select" value={form.campaign_id ?? ""} onChange={(e) => update({ campaign_id: e.target.value || null })} disabled={!canWrite}>
                          <option value="">— none —</option>
                          {lookups.campaigns.map((campaign) => (
                            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Pillar</label>
                        <input className="input" value={form.content_pillar ?? ""} onChange={(e) => update({ content_pillar: e.target.value })} disabled={!canWrite} placeholder="Product, Education…" />
                      </div>
                      <div>
                        <label className="label">Platform</label>
                        <select className="select" value={form.platform ?? "instagram"} onChange={(e) => update({ platform: e.target.value })} disabled={!canWrite}>
                          {PLATFORMS.map((platform) => (
                            <option key={platform.key} value={platform.key}>{platform.label}</option>
                          ))}
                        </select>
                        {!["instagram", "facebook"].includes(String(form.platform)) && (
                          <p className="mt-1 text-[10px] text-amber-400">No live publisher yet — scheduling will record a sandbox delivery.</p>
                        )}
                      </div>
                      <div>
                        <label className="label">Content type</label>
                        <select className="select" value={form.content_type ?? "image"} onChange={(e) => update({ content_type: e.target.value })} disabled={!canWrite}>
                          {CONTENT_TYPES.map((type) => (
                            <option key={type} value={type}>{label(type)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Priority</label>
                        <select className="select" value={form.priority ?? "medium"} onChange={(e) => update({ priority: e.target.value })} disabled={!canWrite}>
                          {["low", "medium", "high", "urgent"].map((p) => (
                            <option key={p} value={p}>{label(p)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="label !mb-1">Caption</label>
                        <div className="flex items-center gap-1.5">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setAiOpen(true); setAiMode("caption"); }}>
                            <Sparkles size={11} /> AI caption
                          </button>
                          <span className={cn("text-[10px]", charCount > captionLimit ? "text-rose-400" : "text-[var(--muted)]")}>
                            {charCount}/{captionLimit}
                          </span>
                        </div>
                      </div>
                      <textarea
                        className="textarea min-h-[150px]"
                        value={form.caption ?? ""}
                        onChange={(e) => update({ caption: e.target.value })}
                        disabled={!canWrite}
                        placeholder="Hook line, two value lines, one CTA. Hashtags go in the field below."
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label">Hashtags</label>
                        <textarea className="textarea !min-h-[70px]" value={form.hashtags ?? ""} onChange={(e) => update({ hashtags: e.target.value })} disabled={!canWrite} placeholder="#Brand #Campaign" />
                      </div>
                      <div>
                        <label className="label">First comment</label>
                        <textarea className="textarea !min-h-[70px]" value={form.first_comment ?? ""} onChange={(e) => update({ first_comment: e.target.value })} disabled={!canWrite} />
                      </div>
                      <div>
                        <label className="label">Call to action</label>
                        <input className="input" value={form.cta ?? ""} onChange={(e) => update({ cta: e.target.value })} disabled={!canWrite} />
                      </div>
                      <div>
                        <label className="label">Location</label>
                        <input className="input" value={form.location_name ?? ""} onChange={(e) => update({ location_name: e.target.value })} disabled={!canWrite} />
                      </div>
                      <div>
                        <label className="label">Alt text</label>
                        <input className="input" value={form.alt_text ?? ""} onChange={(e) => update({ alt_text: e.target.value })} disabled={!canWrite} placeholder="Describe the creative for accessibility" />
                      </div>
                      <div>
                        <label className="label">Deadline</label>
                        <input
                          type="datetime-local"
                          className="input"
                          value={form.deadline ? new Date(form.deadline).toISOString().slice(0, 16) : ""}
                          onChange={(e) => update({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          disabled={!canWrite}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Internal notes (never published)</label>
                      <textarea className="textarea !min-h-[70px]" value={form.internal_notes ?? ""} onChange={(e) => update({ internal_notes: e.target.value })} disabled={!canWrite} />
                    </div>
                  </div>
                )}

                {tab === "brief" && (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Content brief</label>
                      <textarea className="textarea min-h-[110px]" value={form.brief ?? ""} onChange={(e) => update({ brief: e.target.value })} disabled={!canWrite} placeholder="Objective, key message, must-say / must-avoid." />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label">Creative requirements</label>
                        <textarea className="textarea" value={form.creative_requirements ?? ""} onChange={(e) => update({ creative_requirements: e.target.value })} disabled={!canWrite} placeholder="1080x1080 + 1080x1920 cutdown" />
                      </div>
                      <div>
                        <label className="label">Target audience</label>
                        <textarea className="textarea" value={form.target_audience ?? ""} onChange={(e) => update({ target_audience: e.target.value })} disabled={!canWrite} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Reference files / links</label>
                        <input className="input" value={form.reference_files ?? ""} onChange={(e) => update({ reference_files: e.target.value })} disabled={!canWrite} placeholder="Brand guidelines v3, moodboard URL" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {([
                        ["assigned_writer_id", "Assigned writer"],
                        ["assigned_designer_id", "Assigned designer"],
                        ["reviewer_id", "Reviewer"],
                      ] as const).map(([field, fieldLabel]) => (
                        <div key={field}>
                          <label className="label">{fieldLabel}</label>
                          <select className="select" value={form[field] ?? ""} onChange={(e) => update({ [field]: e.target.value || null })} disabled={!canWrite}>
                            <option value="">— unassigned —</option>
                            {lookups.users.map((user) => (
                              <option key={user.id} value={user.id}>{user.full_name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    {canWrite && (
                      <button
                        className="btn btn-sm"
                        onClick={() => act("assign", { writerId: form.assigned_writer_id, designerId: form.assigned_designer_id, reviewerId: form.reviewer_id })}
                        disabled={busyAction !== null}
                      >
                        Save assignments
                      </button>
                    )}
                  </div>
                )}

                {tab === "media" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-[var(--muted)]">
                        {detail.media.length === 0 ? "No media attached. Carousels need at least 2 items; other formats need 1." : `${detail.media.length} asset(s) attached`}
                      </p>
                      {canWrite && (
                        <button className="btn btn-sm" onClick={() => setMediaPickerOpen(true)}>
                          <Plus size={12} /> Attach from library
                        </button>
                      )}
                    </div>
                    {detail.media.length === 0 ? (
                      <EmptyState title="No creative yet" description="A planned post does not need final creative. Attach assets when they exist." icon={<ImageIcon size={18} />} />
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {detail.media.map((asset) => (
                          <div key={asset.id} className="group relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--card-2)]">
                            {asset.mime_type?.startsWith("image/") ? (
                              <img src={asset.url ?? ""} alt={asset.alt_text ?? asset.name} className="aspect-square w-full object-cover" />
                            ) : (
                              <div className="flex aspect-square items-center justify-center text-[11px] text-[var(--muted)]">Video</div>
                            )}
                            <div className="flex items-center justify-between gap-1 p-1.5">
                              <span className="truncate text-[10px] text-[var(--muted)]">{asset.name}</span>
                              {canWrite && (
                                <button className="text-rose-300" onClick={() => detachMedia(asset.id)} aria-label="Detach">
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "approvals" && (
                  <div className="space-y-3">
                    {detail.approvals.length === 0 && (
                      <EmptyState title="No approval stages" description="Send the post for review to create the approval stages configured on the client." />
                    )}
                    {detail.approvals.map((approval) => (
                      <div key={approval.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12.5px] font-medium">{label(approval.stage)}</p>
                          <Badge status={approval.status} />
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">
                          {approval.reviewer_name ?? "Unassigned reviewer"} · due {formatDate(approval.due_at)}
                          {approval.decided_at ? ` · decided ${formatDate(approval.decided_at)}` : ""}
                        </p>
                        {approval.feedback && <p className="mt-1 rounded bg-[var(--navy)] px-2 py-1 text-[11.5px]">{approval.feedback}</p>}
                        {canApprove && approval.status === "pending" && (
                          <div className="mt-2 flex gap-1.5">
                            <button
                              className="btn btn-sm"
                              onClick={async () => {
                                await api("/api/v1/approvals", { method: "POST", json: { approvalId: approval.id, decision: "approved" } });
                                await loadPost(String(selectedId));
                                toast.success("Stage approved");
                              }}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={async () => {
                                const feedback = window.prompt("What needs to change?");
                                if (!feedback) return;
                                await api("/api/v1/approvals", { method: "POST", json: { approvalId: approval.id, decision: "changes_requested", feedback } });
                                await loadPost(String(selectedId));
                                toast.info("Changes requested");
                              }}
                            >
                              Request changes
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {allApproved && <Banner tone="success" title="All stages approved">This post can be scheduled or published now.</Banner>}
                    {approvalsPending.length > 0 && (
                      <Banner tone="warning" title={`${approvalsPending.length} stage(s) pending`}>
                        Publication is blocked server-side until every stage is approved.
                      </Banner>
                    )}
                  </div>
                )}

                {tab === "comments" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {detail.comments.length === 0 && <p className="text-[12px] text-[var(--muted)]">No internal comments yet.</p>}
                      {detail.comments.map((entry) => (
                        <div key={entry.id} className="flex gap-2">
                          <Avatar name={entry.full_name} color={entry.avatar_color} size={22} />
                          <div className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5">
                            <p className="text-[11px] text-[var(--muted)]">{entry.full_name} · {formatDateTime(entry.created_at)}</p>
                            <p className="text-[12px]">{entry.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {canWrite && (
                      <div className="flex gap-2">
                        <input className="input" placeholder="Add an internal comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                        <button
                          className="btn btn-sm"
                          disabled={!comment.trim()}
                          onClick={async () => {
                            await act("comment", { body: comment });
                            setComment("");
                          }}
                        >
                          Comment
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {tab === "versions" && (
                  <div className="space-y-2">
                    {detail.versions.map((version) => {
                      let snapshot: Record<string, unknown> = {};
                      try {
                        snapshot = JSON.parse(String(version.snapshot_json));
                      } catch {
                        snapshot = {};
                      }
                      return (
                        <div key={version.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <p className="font-medium">v{version.version_no}</p>
                            <span className="text-[var(--muted)]">{formatDateTime(version.created_at)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--muted)]">
                            {String(snapshot.title ?? "")} — {String(snapshot.caption ?? "no caption")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tab === "publishing" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-3">
                      <p className="text-[12.5px] font-medium">Schedule this post</p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        Jobs are persisted in publishing_jobs and executed by the background worker — no browser tab required.
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px]">
                        <input
                          type="datetime-local"
                          className="input"
                          value={scheduleAt}
                          onChange={(e) => setScheduleAt(e.target.value)}
                          disabled={!canScheduleHere}
                        />
                        <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as "auto" | "sandbox")} disabled={!canScheduleHere}>
                          <option value="auto">Auto (live if connected)</option>
                          <option value="sandbox">Sandbox (simulate)</option>
                        </select>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!canScheduleHere || !scheduleAt || busyAction !== null}
                          onClick={async () => {
                            const data = await act("schedule", { scheduledAt: new Date(scheduleAt).toISOString(), channel });
                            if (data) toast.success("Queued", `Delivery channel: ${String((data as Record<string, unknown>).channel ?? channel)}`);
                          }}
                        >
                          <Clock size={12} /> Schedule
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={!canScheduleHere || busyAction !== null}
                          onClick={() => {
                            if (!window.confirm("Queue this post for immediate delivery through the publishing worker?")) return;
                            void act("publish_now", { channel }).then((data) => {
                              if (data) toast.success("Publishing queued", "The worker will process it within one tick.");
                            });
                          }}
                        >
                          <Rocket size={12} /> Publish now
                        </button>
                        <button className="btn btn-sm" disabled={!canScheduleHere || busyAction !== null} onClick={() => act("unschedule")}>
                          <X size={12} /> Cancel schedule
                        </button>
                        {canWrite && (
                          <button className="btn btn-sm" onClick={async () => { await act("duplicate"); toast.success("Post duplicated"); }}>
                            Duplicate
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Publishing jobs</p>
                      {detail.jobs.length === 0 && <p className="text-[12px] text-[var(--muted)]">No jobs yet for this post.</p>}
                      {detail.jobs.map((job) => (
                        <div key={job.id} className="mb-1.5 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                          <div className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className="font-mono text-[10.5px]">{String(job.id).slice(0, 8)}</span>
                            <Badge status={String(job.status)} />
                          </div>
                          <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">
                            run {formatDateTime(String(job.run_at))} · attempts {job.attempts}/{job.max_attempts} · channel {job.channel}
                          </p>
                          {job.last_error && <p className="mt-1 text-[10.5px] text-rose-300">{job.last_error}</p>}
                        </div>
                      ))}
                    </div>

                    {detail.published.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Delivery records</p>
                        {detail.published.map((published) => (
                          <div key={published.id} className="mb-1.5 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 text-[11.5px]">
                            <p className="flex items-center justify-between">
                              <span>{formatDateTime(published.published_at)}</span>
                              <Badge status={published.channel === "live" ? "published" : "draft"}>
                                {published.channel === "live" ? "Live on Meta" : "Sandbox"}
                              </Badge>
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">
                              external id: {published.external_post_id ?? "none"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Preview + actions */}
      <div className="space-y-3 xl:sticky xl:top-[72px] h-fit">
        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] mb-2">Platform preview</p>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--navy)] overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#35A7FF] to-[#1677FF] text-[10px] font-bold text-white">
                {(lookups.clients.find((c) => c.id === form.client_id)?.name ?? "SH").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-semibold">{lookups.clients.find((c) => c.id === form.client_id)?.name ?? "Your brand"}</p>
                <p className="text-[9.5px] text-[var(--muted)]">{label(String(form.platform))} · sponsored</p>
              </div>
            </div>
            {previewMedia?.mime_type?.startsWith("image/") ? (
              <img src={previewMedia.url ?? ""} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-[var(--card-2)] text-[11px] text-[var(--muted)]">
                {form.content_type === "carousel" ? "Carousel preview" : form.content_type === "reel" ? "Reel preview" : "No creative attached"}
              </div>
            )}
            <div className="px-2.5 py-2">
              <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap break-words">
                <span className="font-semibold">{lookups.clients.find((c) => c.id === form.client_id)?.name ?? "yourbrand"} </span>
                {String(form.caption ?? "").slice(0, 300) || <span className="text-[var(--muted)]">Caption preview appears here.</span>}
              </p>
              {form.hashtags && <p className="mt-1 text-[11px] text-[#35A7FF] break-words">{String(form.hashtags)}</p>}
              <p className="mt-1.5 text-[10px] text-[var(--muted)]">{form.location_name ? `📍 ${form.location_name}` : ""}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
            Preview is an approximation of the feed. Actual rendering is decided by each platform.
          </p>
        </Card>

        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] mb-2">Approval progress</p>
          {(detail?.approvals?.length ?? 0) === 0 ? (
            <p className="text-[11.5px] text-[var(--muted)]">No stages yet.</p>
          ) : (
            <>
              <Progress
                value={((detail?.approvals ?? []).filter((a) => a.status === "approved").length / (detail?.approvals?.length ?? 1)) * 100}
                tone={allApproved ? "var(--ok)" : "var(--warn)"}
              />
              <div className="mt-2 space-y-1">
                {detail?.approvals?.map((approval) => (
                  <div key={approval.id} className="flex items-center justify-between text-[11px]">
                    <span>{label(approval.stage)}</span>
                    <Badge status={approval.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] mb-2">Quick AI</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { mode: "hook", label: "Hooks" },
              { mode: "hashtags", label: "Hashtags" },
              { mode: "cta", label: "CTAs" },
              { mode: "brief", label: "Brief" },
            ].map((item) => (
              <button
                key={item.mode}
                className="btn btn-sm justify-start"
                onClick={() => {
                  setAiMode(item.mode);
                  setAiOpen(true);
                  void runAi(item.mode);
                }}
                disabled={aiBusy}
              >
                <Sparkles size={11} /> {item.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm w-full mt-1.5" onClick={() => { setAiOpen(true); setAiMode("weekly_plan"); }}>
            <CalendarClock size={11} /> Weekly content plan
          </button>
        </Card>
      </div>

      {/* New post modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New post"
        description="Start with a title only — captions and creative can come later."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setNewOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={createPost} disabled={busyAction === "create"}>
              {busyAction === "create" ? "Creating…" : "Create post"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" autoFocus value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })} placeholder="Winter Glow launch — hero" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Platform</label>
              <select className="select" value={newPost.platform} onChange={(e) => setNewPost({ ...newPost, platform: e.target.value })}>
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Content type</label>
              <select className="select" value={newPost.content_type} onChange={(e) => setNewPost({ ...newPost, content_type: e.target.value })}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{label(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Client</label>
              <select className="select" value={newPost.client_id} onChange={(e) => setNewPost({ ...newPost, client_id: e.target.value })}>
                <option value="">— none —</option>
                {lookups.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Campaign</label>
              <select className="select" value={newPost.campaign_id} onChange={(e) => setNewPost({ ...newPost, campaign_id: e.target.value })}>
                <option value="">— none —</option>
                {lookups.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Media picker */}
      <Modal open={mediaPickerOpen} onClose={() => setMediaPickerOpen(false)} title="Attach media" description="Assets from this workspace's media library." size="lg">
        {media.length === 0 ? (
          <EmptyState title="Library is empty" description="Upload assets in the Media Library first." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((asset) => (
              <button key={asset.id} className="overflow-hidden rounded-lg border border-[var(--line)] hover:border-[var(--brand)]" onClick={() => attachMedia(asset.id)}>
                {asset.mime_type.startsWith("image/") ? (
                  <img src={asset.url ?? ""} alt={asset.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-[10px] text-[var(--muted)]">Video</div>
                )}
                <p className="truncate px-1.5 py-1 text-[10px] text-[var(--muted)]">{asset.name}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* AI modal */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI assistant" description="Generated content is always editable and never published automatically." size="lg">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <select className="select" value={aiMode} onChange={(e) => setAiMode(e.target.value)}>
              {[
                ["caption", "Caption"], ["captions", "3 caption variations"], ["hashtags", "Hashtags"], ["hook", "Hooks"],
                ["cta", "Calls to action"], ["rewrite", "Rewrite caption"], ["repurpose", "Repurpose"], ["reel_script", "Reel script"],
                ["carousel_outline", "Carousel outline"], ["weekly_plan", "Weekly plan"], ["monthly_calendar", "Monthly calendar"],
                ["campaign_ideas", "Campaign ideas"], ["brief", "Content brief"], ["creative_direction", "Creative direction"],
              ].map(([value, labelText]) => (
                <option key={value} value={value}>{labelText}</option>
              ))}
            </select>
            <input className="input" placeholder="Tone (optional)" value={aiTone} onChange={(e) => setAiTone(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => runAi()} disabled={aiBusy}>
            {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate
          </button>
          {aiResult && (
            <>
              <textarea className="textarea min-h-[220px] font-mono text-[12px]" value={aiResult} onChange={(e) => setAiResult(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                <button className="btn btn-sm" onClick={() => { update({ caption: aiResult }); setAiOpen(false); toast.success("Caption replaced"); }}>
                  Use as caption
                </button>
                <button className="btn btn-sm" onClick={() => { update({ hashtags: aiResult }); setAiOpen(false); }}>
                  Use as hashtags
                </button>
                <button className="btn btn-sm" onClick={() => { update({ brief: aiResult }); setAiOpen(false); }}>
                  Use as brief
                </button>
                <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(aiResult)}>Copy</button>
              </div>
            </>
          )}
          <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
            Provider order: Ollama → OpenAI-compatible → built-in template engine. No provider is configured by default, and the
            template engine is deterministic — it never invents metrics.
          </p>
        </div>
      </Modal>
    </div>
  );
}
