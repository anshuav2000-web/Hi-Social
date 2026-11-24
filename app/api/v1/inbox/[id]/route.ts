import { z } from "zod";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { env, metaConfigured } from "@/lib/env";
import * as meta from "@/lib/meta";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("inbox.read");
    const conversation = get<Record<string, unknown>>(
      `SELECT con.*, c.name AS client_name, u.full_name AS assignee_name, sa.name AS account_name, sa.status AS account_status
         FROM inbox_conversations con
         LEFT JOIN clients c ON c.id = con.client_id
         LEFT JOIN users u ON u.id = con.assignee_id
         LEFT JOIN social_accounts sa ON sa.id = con.social_account_id
        WHERE con.id = ? AND con.workspace_id = ?`,
      [id, ctx.workspace.id],
    );
    if (!conversation) throw new ApiError("Conversation not found", 404, "not_found");
    const messages = all(
      `SELECT m.*, u.full_name AS sender_name FROM inbox_messages m LEFT JOIN users u ON u.id = m.sent_by
        WHERE m.conversation_id = ? ORDER BY m.created_at ASC`,
      [id],
    );
    run("UPDATE inbox_messages SET is_read = 1 WHERE conversation_id = ? AND direction = 'inbound'", [id]);
    return ok({ conversation, messages });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  action: z.enum(["reply", "note", "assign", "status", "priority", "label"]),
  body: z.string().max(4000).optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  labels: z.string().max(300).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("inbox.write");
    const body = await parseJson(req, schema);
    const conv = get<{
      id: string;
      workspace_id: string;
      external_id: string | null;
      kind: string;
      social_account_id: string | null;
      first_response_seconds: number | null;
      created_at: string;
      status: string;
    }>("SELECT * FROM inbox_conversations WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
    if (!conv) throw new ApiError("Conversation not found", 404, "not_found");

    if (body.action === "reply") {
      if (!body.body?.trim()) throw new ApiError("Reply cannot be empty", 422, "empty_reply");
      let delivery: "live" | "sandbox" = "sandbox";
      let deliveredId: string | null = null;
      let deliveryError: string | null = null;

      const token = conv.social_account_id
        ? get<{ access_token_enc: string; expires_at: string | null }>(
            "SELECT access_token_enc, expires_at FROM oauth_tokens WHERE social_account_id = ? ORDER BY created_at DESC LIMIT 1",
            [conv.social_account_id],
          )
        : null;
      const account = conv.social_account_id
        ? get<{ status: string }>("SELECT status FROM social_accounts WHERE id = ?", [conv.social_account_id])
        : null;

      if (metaConfigured() && token && account?.status === "connected" && conv.kind === "comment" && conv.external_id) {
        try {
          const { decryptSecret } = await import("@/lib/crypto");
          const accessToken = decryptSecret(token.access_token_enc);
          const res = await meta.replyToComment(conv.external_id, accessToken, body.body);
          delivery = "live";
          deliveredId = res.id;
        } catch (err) {
          deliveryError = err instanceof Error ? err.message : "Meta reply failed";
        }
      }

      run(
        `INSERT INTO inbox_messages (id, conversation_id, direction, author_name, author_external_id, body, external_id, is_read, sent_by, created_at)
         VALUES (?,?,'outbound',?,NULL,?,?,1,?,?)`,
        [uid(), id, ctx.user.full_name, body.body, deliveredId, ctx.user.id, nowIso()],
      );
      run(
        `UPDATE inbox_conversations SET last_message_at = ?, status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
           first_response_seconds = COALESCE(first_response_seconds, ?) WHERE id = ?`,
        [nowIso(), Math.max(0, Math.round((Date.now() - new Date(conv.created_at).getTime()) / 1000)), id],
      );
      logAudit(ctx, "inbox.replied", "inbox_conversation", id, { delivery, deliveryError }, requestIp(req));
      return ok({
        delivery,
        deliveryError,
        note:
          delivery === "sandbox"
            ? `Simulated reply: ${account?.status === "connected" ? "the account is live but the platform call was not attempted" : "no live Meta account is connected"}. The message is stored in SocialHub Pro only.`
            : "Reply delivered through the Meta Graph API.",
      });
    }

    if (body.action === "note") {
      if (!body.body?.trim()) throw new ApiError("Note cannot be empty", 422, "empty_note");
      run(
        `INSERT INTO inbox_messages (id, conversation_id, direction, author_name, author_external_id, body, external_id, is_read, sent_by, created_at)
         VALUES (?,?,'note',?,NULL,?,NULL,1,?,?)`,
        [uid(), id, ctx.user.full_name, body.body, ctx.user.id, nowIso()],
      );
      logAudit(ctx, "inbox.note_added", "inbox_conversation", id, {}, requestIp(req));
      return ok({ internal: true });
    }

    if (body.action === "assign") {
      run("UPDATE inbox_conversations SET assignee_id = ? WHERE id = ?", [body.assigneeId ?? null, id]);
    } else if (body.action === "status" && body.status) {
      run("UPDATE inbox_conversations SET status = ? WHERE id = ?", [body.status, id]);
    } else if (body.action === "priority" && body.priority) {
      run("UPDATE inbox_conversations SET priority = ? WHERE id = ?", [body.priority, id]);
    } else if (body.action === "label") {
      run("UPDATE inbox_conversations SET labels = ? WHERE id = ?", [body.labels ?? null, id]);
    }
    logAudit(ctx, `inbox.${body.action}`, "inbox_conversation", id, body, requestIp(req));
    return ok(get("SELECT * FROM inbox_conversations WHERE id = ?", [id]));
  } catch (err) {
    return handleApiError(err);
  }
}
