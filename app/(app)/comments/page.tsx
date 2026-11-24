import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { InboxClient } from "@/components/inbox-client";
import { Card, PageHeader, SectionHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function CommentsPage() {
  const ctx = await requirePermission("inbox.read");
  const conversations = all<{
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
  }>(
    `SELECT con.id, con.subject, con.participant_name, con.participant_handle, con.platform, con.kind, con.status,
            con.priority, con.labels, con.assignee_id, u.full_name AS assignee_name, c.name AS client_name,
            (SELECT body FROM inbox_messages m WHERE m.conversation_id = con.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            con.last_message_at,
            (SELECT COUNT(*) FROM inbox_messages m WHERE m.conversation_id = con.id AND m.is_read = 0 AND m.direction = 'inbound') AS unread_count
       FROM inbox_conversations con
       LEFT JOIN users u ON u.id = con.assignee_id LEFT JOIN clients c ON c.id = con.client_id
      WHERE con.workspace_id = ? AND con.kind = 'comment'
      ORDER BY con.last_message_at DESC LIMIT 100`,
    [ctx.workspace.id],
  );

  const members = all<{ id: string; full_name: string; avatar_color: string }>(
    `SELECT u.id, u.full_name, u.avatar_color FROM users u JOIN workspace_members wm ON wm.user_id = u.id
      WHERE wm.workspace_id = ? AND wm.status = 'active' ORDER BY u.full_name`,
    [ctx.workspace.id],
  );

  const resolved = all<{ id: string; subject: string | null; participant_name: string | null; labels: string | null; last_message_at: string }>(
    `SELECT id, subject, participant_name, labels, last_message_at FROM inbox_conversations
      WHERE workspace_id = ? AND kind = 'comment' AND status = 'resolved' ORDER BY last_message_at DESC LIMIT 12`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Publish"
        title="Comments Management"
        description="Moderate and answer comments. Replies go through the platform only when the account is live; otherwise they are stored with a sandbox label."
      />
      <InboxClient
        initialConversations={conversations}
        members={members}
        canWrite={hasPermission(ctx, "inbox.write")}
        defaultKind="comment"
        title="Comment threads"
      />
      <Card>
        <SectionHeader title="Recently resolved" description="Closed threads stay for reporting on response time." />
        <div className="mt-2 space-y-1.5">
          {resolved.length === 0 && <p className="text-[12px] text-[var(--muted)]">No resolved threads yet.</p>}
          {resolved.map((thread) => (
            <div key={thread.id} className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="min-w-0 truncate">
                {thread.participant_name ?? "Unknown"} — <span className="text-[var(--muted)]">{thread.subject}</span>
              </span>
              <span className="shrink-0 text-[10.5px] text-[var(--muted)]">{formatDate(thread.last_message_at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
