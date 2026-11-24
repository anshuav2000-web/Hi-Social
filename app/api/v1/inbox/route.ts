import { all } from "@/lib/db";
import { handleApiError, ok } from "@/lib/http";
import { guard } from "@/lib/api-guard";

export async function GET(req: Request) {
  try {
    const ctx = await guard("inbox.read");
    const url = new URL(req.url);
    const where = ["con.workspace_id = ?"];
    const params: unknown[] = [ctx.workspace.id];

    const status = url.searchParams.get("status");
    if (status && status !== "all") {
      where.push("con.status = ?");
      params.push(status);
    }
    const priority = url.searchParams.get("priority");
    if (priority) {
      where.push("con.priority = ?");
      params.push(priority);
    }
    if (url.searchParams.get("assigned") === "me") {
      where.push("con.assignee_id = ?");
      params.push(ctx.user.id);
    }
    if (url.searchParams.get("assigned") === "unassigned") {
      where.push("con.assignee_id IS NULL");
    }
    if (url.searchParams.get("unread") === "1") {
      where.push("EXISTS (SELECT 1 FROM inbox_messages m WHERE m.conversation_id = con.id AND m.is_read = 0 AND m.direction = 'inbound')");
    }
    const kind = url.searchParams.get("kind");
    if (kind) {
      where.push("con.kind = ?");
      params.push(kind);
    }
    const clientId = url.searchParams.get("client_id");
    if (clientId) {
      where.push("con.client_id = ?");
      params.push(clientId);
    }

    const rows = all(
      `SELECT con.*, c.name AS client_name, u.full_name AS assignee_name,
              (SELECT body FROM inbox_messages m WHERE m.conversation_id = con.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM inbox_messages m WHERE m.conversation_id = con.id AND m.is_read = 0 AND m.direction = 'inbound') AS unread_count
         FROM inbox_conversations con
         LEFT JOIN clients c ON c.id = con.client_id
         LEFT JOIN users u ON u.id = con.assignee_id
        WHERE ${where.join(" AND ")}
        ORDER BY con.last_message_at DESC LIMIT 200`,
      params,
    );
    return ok({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}
