import "server-only";
import { all } from "@/lib/db";

/** Option lists shared by every resource form in a workspace. */
export function workspaceLookups(workspaceId: string) {
  return {
    clients: all<{ id: string; name: string }>("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [workspaceId]),
    users: all<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN workspace_members wm ON wm.user_id = u.id
        WHERE wm.workspace_id = ? AND wm.status = 'active' ORDER BY u.full_name`,
      [workspaceId],
    ),
    campaigns: all<{ id: string; name: string }>("SELECT id, name FROM campaigns WHERE workspace_id = ? ORDER BY name", [workspaceId]),
    posts: all<{ id: string; title: string }>(
      "SELECT id, title FROM social_posts WHERE workspace_id = ? AND status != 'archived' ORDER BY created_at DESC LIMIT 200",
      [workspaceId],
    ),
  };
}
