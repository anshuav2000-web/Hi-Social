"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Plus, Send, Trash2 } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Avatar, Badge, Card, EmptyState, Progress } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { cn, formatDate, formatDateTime, label } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_color: string | null;
  client_id: string | null;
  client_name: string | null;
  post_id: string | null;
  post_title: string | null;
  due_date: string | null;
  depends_on_task_id: string | null;
  completed_at: string | null;
};

type TaskDetail = {
  task: Task & { reviewer_name: string | null };
  comments: { id: string; body: string; full_name: string; avatar_color: string; created_at: string }[];
  checklist: { id: string; label: string; is_done: number }[];
  subtasks: { id: string; title: string; status: string }[];
  attachments: { id: string; name: string; url: string | null }[];
};

const COLUMNS = ["todo", "in_progress", "review", "done"];

export function TasksClient({
  initialTasks,
  members,
  canWrite,
}: {
  initialTasks: Task[];
  members: { id: string; full_name: string; avatar_color: string }[];
  canWrite: boolean;
}) {
  const toast = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<"board" | "list">("board");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [checkLabel, setCheckLabel] = useState("");
  const [subtask, setSubtask] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", kind: "writing", priority: "medium", assignee_id: members[0]?.id ?? "", due_date: "" });
  const [filter, setFilter] = useState({ assignee: "", status: "" });

  const loadDetail = useCallback(async (id: string) => {
    const res = await api<TaskDetail>(`/api/v1/tasks/${id}`);
    if (res.ok) setDetail(res.data);
  }, []);

  useEffect(() => {
    if (detailId) void loadDetail(detailId);
    else setDetail(null);
  }, [detailId, loadDetail]);

  const refresh = useCallback(async () => {
    const res = await api<{ rows: Task[] }>("/api/v1/data/tasks?pageSize=200");
    if (res.ok) {
      setTasks(
        (res.data.rows as unknown as (Task & { assignee_name?: string })[]).map((row) => ({
          ...row,
          assignee_name: members.find((m) => m.id === row.assignee_id)?.full_name ?? null,
        })) as Task[],
      );
    }
  }, [members]);

  const move = async (taskId: string, status: string) => {
    const res = await api(`/api/v1/tasks/${taskId}`, { method: "POST", json: { action: "status", status } });
    if (!res.ok) {
      toast.error("Status blocked", res.error);
      return;
    }
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    if (detailId === taskId) void loadDetail(taskId);
  };

  const create = async () => {
    if (!draft.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const res = await api("/api/v1/data/tasks", {
      method: "POST",
      json: {
        title: draft.title,
        kind: draft.kind,
        priority: draft.priority,
        status: "todo",
        assignee_id: draft.assignee_id || null,
        due_date: draft.due_date ? new Date(`${draft.due_date}T17:00:00.000Z`).toISOString() : null,
      },
    });
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    toast.success("Task created");
    setNewOpen(false);
    setDraft({ ...draft, title: "" });
    await refresh();
  };

  const filtered = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter.assignee && task.assignee_id !== filter.assignee) return false;
        if (filter.status && task.status !== filter.status) return false;
        return true;
      }),
    [tasks, filter],
  );

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const task of filtered) (map[task.status] ??= []).push(task);
    return map;
  }, [filtered]);

  const overdue = filtered.filter((task) => task.status !== "done" && task.due_date && new Date(task.due_date) < new Date()).length;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-0.5">
            {(["board", "list"] as const).map((option) => (
              <button key={option} className="chip !border-0 !bg-transparent !py-1 capitalize" data-active={view === option} onClick={() => setView(option)}>
                {option}
              </button>
            ))}
          </div>
          <select className="select h-8 w-auto text-[11.5px]" value={filter.assignee} onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}>
            <option value="">All assignees</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
          <select className="select h-8 w-auto text-[11.5px]" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">All statuses</option>
            {COLUMNS.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
          <span className={cn("badge", overdue > 0 ? "border-rose-500/40 text-rose-300" : "")}>{overdue} overdue</span>
          <button className="btn btn-primary btn-sm ml-auto" onClick={() => setNewOpen(true)} disabled={!canWrite}>
            <Plus size={12} /> New task
          </button>
        </div>
      </Card>

      {view === "board" && (
        <div className="grid gap-2 md:grid-cols-4">
          {COLUMNS.map((column) => (
            <div
              key={column}
              className={cn("rounded-xl border border-[var(--line)] bg-[var(--card-2)]/60 p-2 min-h-[220px]", over === column && "drop-target")}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(column);
              }}
              onDragLeave={() => setOver((prev) => (prev === column ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragId) void move(dragId, column);
                setDragId(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11.5px] font-semibold">{label(column)}</p>
                <span className="badge !py-0 !text-[9px]">{grouped[column]?.length ?? 0}</span>
              </div>
              <div className="space-y-1.5">
                {(grouped[column] ?? []).map((task) => {
                  const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date();
                  return (
                    <button
                      key={task.id}
                      draggable={canWrite}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setDetailId(task.id)}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] p-2 text-left hover:border-[var(--line-strong)]"
                    >
                      <p className="line-clamp-2 text-[11.5px] font-medium leading-snug">{task.title}</p>
                      <p className="mt-1 text-[9.5px] text-[var(--muted)]">
                        {task.client_name ?? "no client"} · {label(task.kind)}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className={cn("text-[9.5px]", isOverdue ? "text-rose-300" : "text-[var(--muted)]")}>
                          {task.due_date ? formatDate(task.due_date) : "no due date"}
                        </span>
                        {task.assignee_name ? <Avatar name={task.assignee_name} color={task.assignee_color} size={16} /> : <span className="text-[9px] text-[var(--muted)]">unassigned</span>}
                      </div>
                    </button>
                  );
                })}
                {(grouped[column] ?? []).length === 0 && <p className="px-1 py-3 text-[10px] text-[var(--muted)]">Empty</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <Card className="p-0 overflow-hidden">
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>{["Task", "Brand", "Post", "Type", "Status", "Priority", "Assignee", "Due"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id} onClick={() => setDetailId(task.id)} className="cursor-pointer">
                    <td className="font-medium">{task.title}</td>
                    <td className="text-[var(--muted)]">{task.client_name ?? "—"}</td>
                    <td className="text-[var(--muted)]">{task.post_title ? <Link href={`/content-studio?post=${task.post_id}`} className="hover:underline">{task.post_title}</Link> : "—"}</td>
                    <td className="text-[var(--muted)]">{label(task.kind)}</td>
                    <td><Badge status={task.status} /></td>
                    <td><Badge status={task.priority} /></td>
                    <td className="text-[11px]">{task.assignee_name ?? "—"}</td>
                    <td className="text-[11px] text-[var(--muted)]">{formatDate(task.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <EmptyState title="No tasks" description="Create a task or assign one from a post's brief tab." />}
        </Card>
      )}

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title={detail?.task.title ?? "Task"}
        description={detail ? `${label(detail.task.kind)} · ${detail.task.client_name ?? "no client"} · due ${formatDate(detail.task.due_date)}` : undefined}
        size="lg"
        footer={
          detail ? (
            <>
              {detail.task.post_id && (
                <Link href={`/content-studio?post=${detail.task.post_id}`} className="btn btn-sm">Open post</Link>
              )}
              <select className="select h-8 w-auto text-[11.5px]" value={detail.task.status} onChange={(e) => move(detail.task.id, e.target.value)}>
                {COLUMNS.map((status) => <option key={status} value={status}>{label(status)}</option>)}
              </select>
            </>
          ) : undefined
        }
      >
        {!detail ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : (
          <div className="space-y-4">
            {detail.task.description && <p className="text-[12px] leading-relaxed text-[var(--muted)]">{detail.task.description}</p>}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge status={detail.task.priority} />
              <Badge status={detail.task.status} />
              {detail.task.assignee_name && (
                <span className="flex items-center gap-1"><Avatar name={detail.task.assignee_name} color={detail.task.assignee_color} size={16} /> {detail.task.assignee_name}</span>
              )}
              {detail.task.depends_on_task_id && <span className="badge">blocked by dependency</span>}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Checklist ({detail.checklist.filter((c) => c.is_done).length}/{detail.checklist.length})</p>
              <div className="space-y-1">
                {detail.checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={Boolean(item.is_done)}
                      disabled={!canWrite}
                      onChange={async () => {
                        await api(`/api/v1/tasks/${detail.task.id}`, { method: "POST", json: { action: "checklist_toggle", itemId: item.id } });
                        await loadDetail(detail.task.id);
                      }}
                      className="accent-[var(--brand)]"
                    />
                    <span className={item.is_done ? "line-through text-[var(--muted)]" : undefined}>{item.label}</span>
                  </label>
                ))}
                {detail.checklist.length === 0 && <p className="text-[11.5px] text-[var(--muted)]">No checklist items.</p>}
              </div>
              {canWrite && (
                <div className="mt-1.5 flex gap-1.5">
                  <input className="input h-8" placeholder="Add checklist item…" value={checkLabel} onChange={(e) => setCheckLabel(e.target.value)} />
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!checkLabel.trim()) return;
                      await api(`/api/v1/tasks/${detail.task.id}`, { method: "POST", json: { action: "checklist_add", label: checkLabel } });
                      setCheckLabel("");
                      await loadDetail(detail.task.id);
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Subtasks ({detail.subtasks.length})</p>
              <div className="space-y-1">
                {detail.subtasks.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--card-2)] px-2 py-1 text-[11.5px]">
                    <span>{item.title}</span>
                    <Badge status={item.status} />
                  </div>
                ))}
                {detail.subtasks.length === 0 && <p className="text-[11.5px] text-[var(--muted)]">No subtasks.</p>}
              </div>
              {canWrite && (
                <div className="mt-1.5 flex gap-1.5">
                  <input className="input h-8" placeholder="New subtask…" value={subtask} onChange={(e) => setSubtask(e.target.value)} />
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!subtask.trim()) return;
                      await api(`/api/v1/tasks/${detail.task.id}`, { method: "POST", json: { action: "subtask", title: subtask } });
                      setSubtask("");
                      await loadDetail(detail.task.id);
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Comments</p>
              <div className="space-y-1.5">
                {detail.comments.map((entry) => (
                  <div key={entry.id} className="flex gap-2">
                    <Avatar name={entry.full_name} color={entry.avatar_color} size={20} />
                    <div className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--card-2)] px-2 py-1">
                      <p className="text-[10px] text-[var(--muted)]">{entry.full_name} · {formatDateTime(entry.created_at)}</p>
                      <p className="text-[11.5px]">{entry.body}</p>
                    </div>
                  </div>
                ))}
                {detail.comments.length === 0 && <p className="text-[11.5px] text-[var(--muted)]">No comments yet.</p>}
              </div>
              {canWrite && (
                <div className="mt-1.5 flex gap-1.5">
                  <input className="input h-8" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!comment.trim()) return;
                      await api(`/api/v1/tasks/${detail.task.id}`, { method: "POST", json: { action: "comment", body: comment } });
                      setComment("");
                      await loadDetail(detail.task.id);
                    }}
                  >
                    <Send size={11} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10.5px] text-[var(--muted)]">
                Dependencies block completion: a task cannot move to done while its dependency is open.
              </p>
              {canWrite && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    if (!window.confirm("Delete this task?")) return;
                    await api(`/api/v1/data/tasks/${detail.task.id}`, { method: "DELETE" });
                    toast.success("Task deleted");
                    setDetailId(null);
                    await refresh();
                  }}
                >
                  <Trash2 size={11} /> Delete
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New task"
        description="Assign production work with a deadline and priority."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setNewOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={create}>Create task</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {["writing", "design", "video", "review", "other"].map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="select" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                {["low", "medium", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Assignee</label>
              <select className="select" value={draft.assignee_id} onChange={(e) => setDraft({ ...draft, assignee_id: e.target.value })}>
                <option value="">— unassigned —</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
            </div>
          </div>
          <p className="text-[10.5px] text-[var(--muted)]">Tasks can also be created directly from a post's Brief tab, linked to that post.</p>
        </div>
      </Modal>
    </div>
  );
}
