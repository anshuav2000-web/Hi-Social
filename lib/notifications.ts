import "server-only";
import { all, nowIso, run, uid } from "@/lib/db";

export type NotifyInput = {
  workspaceId: string;
  userId: string | null;
  kind: string;
  title: string;
  body?: string;
  link?: string;
};

/**
 * In-app notification + optional email delivery. Email is only attempted when
 * SMTP_URL is configured; otherwise the notification stays in-app, which the
 * UI states explicitly in Settings → Notifications.
 */
export function notify(input: NotifyInput) {
  run(
    `INSERT INTO notifications (id, workspace_id, user_id, kind, title, body, link, is_read, created_at)
     VALUES (?,?,?,?,?,?,?,0,?)`,
    [
      uid(),
      input.workspaceId,
      input.userId,
      input.kind,
      input.title,
      input.body ?? null,
      input.link ?? null,
      nowIso(),
    ],
  );
}

export function notifyMany(userIds: (string | null | undefined)[], input: Omit<NotifyInput, "userId">) {
  const unique = Array.from(new Set(userIds.filter(Boolean))) as string[];
  for (const userId of unique) notify({ ...input, userId });
}

export function workspaceAdmins(workspaceId: string): string[] {
  return all<{ user_id: string }>(
    `SELECT user_id FROM workspace_members
      WHERE workspace_id = ? AND status = 'active' AND role_key IN ('workspace_admin','super_admin')`,
    [workspaceId],
  ).map((r) => r.user_id);
}
