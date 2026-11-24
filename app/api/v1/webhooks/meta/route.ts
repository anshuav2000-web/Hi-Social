import { all, get, nowIso, run, uid } from "@/lib/db";
import { fail, handleApiError, ok } from "@/lib/http";
import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/meta";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && env.meta.webhookVerifyToken && token === env.meta.webhookVerifyToken) {
    return new Response(challenge ?? "ok", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Meta webhook receiver. Verifies X-Hub-Signature-256 against the raw body,
 * deduplicates by provider + entry id, stores the raw payload, then maps
 * comment events into the unified inbox.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const valid = verifyWebhookSignature(raw, signature);
    if (!valid) {
      run(
        `INSERT OR IGNORE INTO integration_webhooks (id, workspace_id, provider, event, external_id, signature_valid, payload_json, status, error, created_at)
         VALUES (NULL,NULL,'meta','invalid_signature',?,0,?,'rejected','Signature verification failed',?)`,
        [`invalid-${Date.now()}`, raw.slice(0, 8000), nowIso()],
      );
      return fail("Invalid signature", 401, "invalid_signature");
    }

    const payload = JSON.parse(raw) as {
      object?: string;
      entry?: {
        id: string;
        time?: number;
        changes?: { field?: string; value?: Record<string, unknown> }[];
      }[];
    };

    let processed = 0;
    let duplicates = 0;

    for (const entry of payload.entry ?? []) {
      const externalId = `${payload.object ?? "unknown"}:${entry.id}:${entry.time ?? 0}`;
      const existing = get<{ id: string }>("SELECT id FROM integration_webhooks WHERE provider = 'meta' AND external_id = ?", [externalId]);
      if (existing) {
        duplicates += 1;
        continue;
      }

      const change = entry.changes?.[0];
      const event = change?.field ?? payload.object ?? "unknown";
      const value = (change?.value ?? {}) as Record<string, unknown>;
      const account = get<{ id: string; workspace_id: string; platform: string }>(
        "SELECT id, workspace_id, platform FROM social_accounts WHERE platform IN ('instagram','facebook') AND external_id IN (?,?) LIMIT 1",
        [String(value.recipient_id ?? entry.id), String(value.page_id ?? entry.id)],
      );

      const webhookId = uid();
      run(
        `INSERT INTO integration_webhooks (id, workspace_id, provider, event, external_id, signature_valid, payload_json, status, error, processed_at, created_at)
         VALUES (?,?, 'meta', ?, ?, 1, ?, 'received', NULL, NULL, ?)`,
        [webhookId, account?.workspace_id ?? null, event, externalId, JSON.stringify(value).slice(0, 20000), nowIso()],
      );

      try {
        if (event === "comments" && account) {
          const commentId = String(value.id ?? "");
          const text = String((value.message as string) ?? (value.text as string) ?? "");
          const from = (value.from ?? {}) as unknown as { id?: string; name?: string; username?: string };
          if (commentId && !get("SELECT id FROM inbox_conversations WHERE workspace_id = ? AND external_id = ?", [account.workspace_id, commentId])) {
            const convId = uid();
            run(
              `INSERT INTO inbox_conversations (id, workspace_id, client_id, social_account_id, platform, external_id, kind, subject,
                participant_name, participant_handle, status, priority, assignee_id, labels, post_ref, first_response_seconds,
                last_message_at, created_at)
               VALUES (?,?,NULL,?,?,?, 'comment', ?, ?, ?, 'open', 'normal', NULL, NULL, ?, NULL, ?, ?)`,
              [
                convId,
                account.workspace_id,
                account.id,
                account.platform,
                commentId,
                text.slice(0, 120) || "New comment",
                from.name ?? from.username ?? "Unknown",
                from.username ? `@${from.username}` : null,
                String((value.media as { id?: string } | undefined)?.id ?? value.post_id ?? ""),
                nowIso(),
                nowIso(),
              ],
            );
            run(
              `INSERT INTO inbox_messages (id, conversation_id, direction, author_name, author_external_id, body, external_id, is_read, sent_by, created_at)
               VALUES (?,?,'inbound',?,?,?,?,0,NULL,?)`,
              [uid(), convId, from.name ?? null, from.id ?? null, text, commentId, nowIso()],
            );
            processed += 1;
          }
        }
        run("UPDATE integration_webhooks SET status = 'processed', processed_at = ? WHERE id = ?", [nowIso(), webhookId]);
      } catch (err) {
        run("UPDATE integration_webhooks SET status = 'failed', error = ?, processed_at = ? WHERE id = ?", [
          err instanceof Error ? err.message : "processing error",
          nowIso(),
          webhookId,
        ]);
      }
    }

    return ok({ processed, duplicates });
  } catch (err) {
    return handleApiError(err);
  }
}

export const dynamic = "force-dynamic";
