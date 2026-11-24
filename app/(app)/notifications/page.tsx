import { all, get } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { NotificationsClient } from "@/components/notifications-client";
import { PageHeader } from "@/components/ui";

export default async function NotificationsPage() {
  const ctx = await requirePermission("workspace.read");
  const rows = all<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    is_read: number;
    created_at: string;
  }>(
    `SELECT id, kind, title, body, link, is_read, created_at FROM notifications
      WHERE workspace_id = ? AND (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 100`,
    [ctx.workspace.id, ctx.user.id],
  );

  const prefs = get<{ notification_prefs: string }>("SELECT notification_prefs FROM users WHERE id = ?", [ctx.user.id]);
  let preferences: Record<string, unknown> = {};
  try {
    preferences = JSON.parse(prefs?.notification_prefs ?? "{}");
  } catch {
    preferences = {};
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Notification Center"
        description="Publishing results, approvals, task reminders and automation alerts, with per-user delivery preferences."
      />
      <NotificationsClient
        initialRows={rows}
        initialPreferences={preferences}
        channels={{ inApp: true, email: Boolean(env.smtpUrl), browser: false }}
        notes={
          env.smtpUrl
            ? "SMTP is configured, so email delivery is available for notifications that set a recipient."
            : "No SMTP_URL is set: email and browser push stay off and in-app notifications are the only channel."
        }
      />
    </div>
  );
}
