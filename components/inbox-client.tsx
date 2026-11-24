"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon, Send, StickyNote, UserCheck, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar, Badge, Banner, Card, EmptyState, PlatformDot } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, formatDateTime, label, timeAgo } from "@/lib/utils";

type Conversation = {
  id: string;
  subject: string | null;
  participant_name: string | null;
  participant_handle: string | null;
  platform: string;
  kind: string;
  status: string;
  priority: string;
  labels: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  client_name: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
};

type Message = {
  id: string;
  direction: string;
  author_name: string | null;
  body: string;
  created_at: string;
  sent_by: string | null;
  sender_name: string | null;
};

export function InboxClient({
  initialConversations,
  members,
  canWrite,
  defaultKind,
  title,
}: {
  initialConversations: Conversation[];
  members: { id: string; full_name: string; avatar_color: string }[];
  canWrite: boolean;
  defaultKind?: "comment" | "message";
  title: string;
}) {
  const toast = useToast();
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Record<string, any> | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ status: "open", priority: "", assigned: "", unread: "" });
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.priority) query.set("priority", filters.priority);
    if (filters.assigned) query.set("assigned", filters.assigned);
    if (filters.unread) query.set("unread", filters.unread);
    if (defaultKind) query.set("kind", defaultKind);
    const res = await api<{ rows: Conversation[] }>(`/api/v1/inbox?${query.toString()}`);
    if (res.ok) setConversations(res.data.rows);
  }, [filters, defaultKind]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadConversation = useCallback(async (id: string) => {
    const res = await api<{ conversation: Record<string, any>; messages: Message[] }>(`/api/v1/inbox/${id}`);
    if (!res.ok) return;
    setConversation(res.data.conversation);
    setMessages(res.data.messages);
  }, []);

  useEffect(() => {
    if (selectedId) void loadConversation(selectedId);
  }, [selectedId, loadConversation]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!selectedId) return;
    setBusy(true);
    const res = await api<{ delivery?: string; note?: string }>(`/api/v1/inbox/${selectedId}`, {
      method: "POST",
      json: { action, ...payload },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    await loadConversation(selectedId);
    await loadList();
    return res.data;
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const result = await act("reply", { body: reply });
    if (result) {
      setNotice(result.note ?? null);
      toast.success(result.delivery === "live" ? "Reply delivered to Meta" : "Reply stored (sandbox)");
      setReply("");
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const result = await act("note", { body: note });
    if (result) {
      toast.success("Internal note added");
      setNote("");
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-0 overflow-hidden h-fit lg:sticky lg:top-[72px]">
        <div className="border-b border-[var(--line)] px-3 py-2.5">
          <p className="text-[13px] font-semibold">{title}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <select className="select h-7 text-[11px]" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {["open", "pending", "resolved", "all"].map((status) => (
                <option key={status} value={status}>{label(status)}</option>
              ))}
            </select>
            <select className="select h-7 text-[11px]" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
              <option value="">Any priority</option>
              {["low", "normal", "high", "urgent"].map((priority) => (
                <option key={priority} value={priority}>{label(priority)}</option>
              ))}
            </select>
            <select className="select h-7 text-[11px]" value={filters.assigned} onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <select className="select h-7 text-[11px]" value={filters.unread} onChange={(e) => setFilters({ ...filters, unread: e.target.value })}>
              <option value="">All</option>
              <option value="1">Unread only</option>
            </select>
          </div>
        </div>
        <div className="max-h-[64vh] overflow-y-auto p-1.5">
          {conversations.length === 0 && <p className="px-2 py-6 text-center text-[11.5px] text-[var(--muted)]">Nothing in this filter.</p>}
          {conversations.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={cn("mb-1 w-full rounded-lg px-2 py-2 text-left", selectedId === item.id ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--card-3)]")}
            >
              <div className="flex items-start justify-between gap-1.5">
                <p className="line-clamp-1 text-[12px] font-medium">{item.subject ?? item.participant_name ?? "Conversation"}</p>
                {item.unread_count > 0 && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />}
              </div>
              <p className="line-clamp-1 text-[10.5px] text-[var(--muted)]">{item.last_message}</p>
              <div className="mt-1 flex items-center justify-between text-[9.5px] text-[var(--muted)]">
                <span className="truncate">{item.participant_handle ?? item.participant_name ?? "unknown"}</span>
                <span>{timeAgo(item.last_message_at)}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <PlatformDot platform={item.platform} />
                {item.priority !== "normal" && <Badge status={item.priority} className="!px-1 !py-0 !text-[8.5px]" />}
                {item.assignee_name && <span className="text-[9px] text-[var(--muted)]">· {item.assignee_name.split(" ")[0]}</span>}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {notice && <Banner tone="warning" title="Delivery note">{notice}</Banner>}
        {!conversation ? (
          <Card>
            <EmptyState title="Select a conversation" description="Comments and messages from connected accounts appear here." icon={<InboxIcon size={18} />} />
          </Card>
        ) : (
          <>
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">{conversation.subject ?? "Conversation"}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {conversation.participant_name} {conversation.participant_handle ? `(${conversation.participant_handle})` : ""} ·{" "}
                    {conversation.client_name ?? "no client"} · {label(conversation.kind)} on {label(conversation.platform)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge status={conversation.status} />
                    <Badge status={conversation.priority}>{label(conversation.priority)}</Badge>
                    {conversation.labels && <span className="badge">{conversation.labels}</span>}
                    {conversation.first_response_seconds && (
                      <span className="badge">first response {Math.round(Number(conversation.first_response_seconds) / 60)}m</span>
                    )}
                    {conversation.account_status !== "connected" && <span className="badge">account: sandbox</span>}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      className="select h-8 w-auto text-[11px]"
                      value={conversation.assignee_id ?? ""}
                      onChange={(e) => act("assign", { assigneeId: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>{member.full_name}</option>
                      ))}
                    </select>
                    <select
                      className="select h-8 w-auto text-[11px]"
                      value={conversation.priority}
                      onChange={(e) => act("priority", { priority: e.target.value })}
                    >
                      {["low", "normal", "high", "urgent"].map((priority) => (
                        <option key={priority} value={priority}>{label(priority)}</option>
                      ))}
                    </select>
                    <button className="btn btn-sm" onClick={() => act("status", { status: conversation.status === "resolved" ? "open" : "resolved" })}>
                      <CheckCircle2 size={12} /> {conversation.status === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-[46vh] space-y-2 overflow-y-auto p-4">
                {messages.length === 0 && <p className="text-[12px] text-[var(--muted)]">No messages yet.</p>}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[86%] rounded-xl border px-3 py-2 text-[12px]",
                      message.direction === "inbound"
                        ? "border-[var(--line)] bg-[var(--card-2)]"
                        : message.direction === "note"
                          ? "ml-auto border-amber-500/30 bg-amber-500/10"
                          : "ml-auto border-sky-500/30 bg-sky-500/10",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                      {message.direction === "note" && <StickyNote size={10} />}
                      {message.direction === "outbound" && <UserCheck size={10} />}
                      <span>{message.direction === "inbound" ? message.author_name ?? "Customer" : message.sender_name ?? "You"}</span>
                      <span>·</span>
                      <span>{formatDateTime(message.created_at)}</span>
                      {message.direction === "note" && <span className="badge !py-0 !text-[8.5px]">internal</span>}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                  </div>
                ))}
              </div>

              {canWrite && (
                <div className="border-t border-[var(--line)] p-3">
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="Write a public reply…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendReply();
                        }
                      }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={sendReply} disabled={busy || !reply.trim()}>
                      <Send size={12} /> Reply
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="input" placeholder="Internal note (never sent to the platform)…" value={note} onChange={(e) => setNote(e.target.value)} />
                    <button className="btn btn-sm" onClick={addNote} disabled={busy || !note.trim()}>
                      <StickyNote size={12} /> Note
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                    Replies are only delivered to the platform when the account holds a live Meta token with comment management
                    permission. Otherwise the reply is stored here and clearly labelled as sandbox.
                  </p>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-2 text-[11.5px] text-[var(--muted)]">
                <Avatar name={conversation.assignee_name ?? "Unassigned"} size={22} />
                <span>
                  Assigned to {conversation.assignee_name ?? "nobody"} · opened {formatDateTime(conversation.created_at)}
                </span>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
