import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { InboxClient } from "@/components/inbox-client";
import { Banner, PageHeader } from "@/components/ui";

export default async function InboxPage() {
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
       LEFT JOIN users u ON u.id = con.assignee_id
       LEFT JOIN clients c ON c.id = con.client_id
      WHERE con.workspace_id = ? AND con.status != 'resolved'
      ORDER BY con.last_message_at DESC LIMIT 100`,
    [ctx.workspace.id],
  );

  const members = all<{ id: string; full_name: string; avatar_color: string }>(
    `SELECT u.id, u.full_name, u.avatar_color FROM users u JOIN workspace_members wm ON wm.user_id = u.id
      WHERE wm.workspace_id = ? AND wm.status = 'active' ORDER BY u.full_name`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Publish"
        title="Unified Social Inbox"
        description="Comments and messages across accounts, with assignment, priority, labels, notes and response-time tracking."
      />
      <Banner tone="info" title="Message scope">
        Comment replies are supported through the Graph API when a live token holds instagram_manage_comments or
        pages_manage_engagement. Direct messages require additional Meta permissions (pages_messaging / instagram_manage_messages)
        and are not claimed here — sandbox conversations are stored locally only.
      </Banner>
      <InboxClient initialConversations={conversations} members={members} canWrite={hasPermission(ctx, "inbox.write")} title="Conversations" />
    </div>
  );
}
