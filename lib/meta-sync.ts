import "server-only";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import * as meta from "@/lib/meta";

/**
 * Historical import + insight sync for a connected account.
 * - Attempts the full 90-day window (Meta retention differs per metric).
 * - Writes metric rows with source='meta'; unavailable metrics stay NULL.
 * - Never fabricates data: if the API refuses a window, the sync records it.
 */
export async function syncAccount(
  workspaceId: string,
  accountId: string,
  kind: "history" | "insights" | "comments",
  actorId: string,
): Promise<{ records: number; notes: string[]; error?: string }> {
  const account = get<{
    id: string;
    platform: string;
    external_id: string;
    status: string;
    name: string;
    client_id: string | null;
  }>("SELECT id, platform, external_id, status, name, client_id FROM social_accounts WHERE id = ? AND workspace_id = ?", [
    accountId,
    workspaceId,
  ]);
  if (!account) throw new Error("Account not found in this workspace");

  const tokenRow = get<{ access_token_enc: string; expires_at: string | null }>(
    "SELECT access_token_enc, expires_at FROM oauth_tokens WHERE social_account_id = ? ORDER BY created_at DESC LIMIT 1",
    [accountId],
  );
  if (!tokenRow) {
    run("UPDATE social_accounts SET last_synced_at = ?, status = 'sandbox' WHERE id = ?", [nowIso(), accountId]);
    return {
      records: 5,
      notes: [`Sandbox mode: simulated sync refreshed ${account.name} (${account.platform}) demo insights`],
    };
  }
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
    throw new Error("The stored access token has expired. Reauthorize the account to resume syncing.");
  }
  const token = decryptSecret(tokenRow.access_token_enc);
  const notes: string[] = [];
  let records = 0;

  try {
  if (account.platform === "instagram" && kind !== "comments") {
    const media = await meta.fetchInstagramMedia(account.external_id, token, 50);
    for (const item of media.data ?? []) {
      const existing = get<{ id: string }>("SELECT id FROM social_posts WHERE workspace_id = ? AND external_post_id = ?", [
        workspaceId,
        item.id,
      ]);
      const postId = existing?.id ?? uid();
      const title = (item.caption ?? "Instagram post").slice(0, 90).replace(/\s+/g, " ");
      if (existing) {
        run("UPDATE social_posts SET caption = ?, external_url = ?, published_at = ?, updated_at = ? WHERE id = ?", [
          item.caption ?? null,
          item.permalink ?? null,
          item.timestamp,
          nowIso(),
          postId,
        ]);
      } else {
        run(
          `INSERT INTO social_posts (id, workspace_id, client_id, campaign_id, title, caption, platform, content_type, status,
            priority, published_at, external_post_id, external_url, approval_required, created_by, created_at, updated_at, media_ready)
           VALUES (?,?,?,NULL,?,?,'instagram',?,'published','medium',?,?,?,0,?,?,?,0)`,
          [
            postId,
            workspaceId,
            account.client_id,
            title,
            item.caption ?? null,
            item.media_type === "VIDEO" ? "reel" : item.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image",
            item.timestamp,
            item.id,
            item.permalink ?? null,
            actorId,
            nowIso(),
            nowIso(),
          ],
        );
        run(
          `INSERT INTO published_posts (id, workspace_id, post_id, social_account_id, platform, external_post_id, url, channel, published_at, raw_json)
           VALUES (?,?,?,?, 'instagram', ?, ?, 'live', ?, ?)`,
          [uid(), workspaceId, postId, accountId, item.id, item.permalink ?? null, item.timestamp, JSON.stringify(item)],
        );
      }
      try {
        const insights = await meta.fetchInstagramMediaInsights(item.id, token);
        const values = Object.fromEntries((insights.data ?? []).map((d) => [d.name, d.values?.[0]?.value ?? null]));
        // Meta withdrew `impressions` for Instagram media in Graph v22+;
        // `engagement` is not a Graph metric — `total_interactions` is its equivalent.
        const impressions = null;
        const reach = numOrNull(values.reach);
        const engagement = numOrNull(values.total_interactions);
        const saves = numOrNull(values.saved);
        const likes = numOrNull(values.likes ?? item.like_count);
        const comments = numOrNull(values.comments ?? item.comments_count);
        run(
          `INSERT INTO post_metrics (id, workspace_id, post_id, social_account_id, platform, captured_at, impressions, reach,
            likes, comments, shares, saves, views, video_views, clicks, engagement, engagement_rate, source)
           VALUES (?,?,?,?, 'instagram', ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, 'meta')`,
          [
            uid(),
            workspaceId,
            postId,
            accountId,
            nowIso(),
            impressions,
            reach,
            likes,
            comments,
            saves,
            engagement,
            reach && engagement ? Number(((engagement / reach) * 100).toFixed(2)) : null,
          ],
        );
        records += 1;
      } catch {
        // Media insights are only available for media owned by the account.
        notes.push(`Insights unavailable for media ${item.id}`);
      }
    }

    try {
      // Graph caps a single insights window at 30 days, so walk the range in chunks.
      // follower_count also refuses to include the current day, so the window ends
      // at the start of today.
      const WINDOW_DAYS = 90;
      const CHUNK_DAYS = 30;
      const endWindowMs = new Date();
      endWindowMs.setUTCHours(0, 0, 0, 0);
      const startWindowMs = endWindowMs.getTime() - WINDOW_DAYS * 86400000;
      let days = 0;
      let profileViewsTotal: number | null = null;

      const store = (metric: { name: string; values?: { value: number; end_time?: string }[] }) => {
        const column = metric.name === "reach" ? "reach" : metric.name === "follower_count" ? "follower_growth" : null;
        if (!column) return 0;
        let stored = 0;
        for (const point of metric.values ?? []) {
          if (!point.end_time) continue;
          const capturedOn = point.end_time.slice(0, 10);
          const existing = get<{ id: string }>(
            "SELECT id FROM account_metrics WHERE social_account_id = ? AND captured_on = ?",
            [accountId, capturedOn],
          );
          if (existing) {
            run(`UPDATE account_metrics SET ${column} = ?, source = 'meta' WHERE id = ?`, [point.value, existing.id]);
          } else {
            run(
              `INSERT INTO account_metrics (id, workspace_id, social_account_id, platform, captured_on, followers, follower_growth,
                impressions, reach, profile_views, engagement, source)
               VALUES (?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,'meta')`,
              [
                uid(),
                workspaceId,
                accountId,
                "instagram",
                capturedOn,
                column === "follower_growth" ? point.value : null,
                column === "reach" ? point.value : null,
              ],
            );
          }
          stored += 1;
        }
        return stored;
      };

      for (let startMs = startWindowMs; startMs < endWindowMs.getTime(); startMs += CHUNK_DAYS * 86400000) {
        const endMs = Math.min(startMs + CHUNK_DAYS * 86400000, endWindowMs.getTime());
        const since = Math.floor(startMs / 1000);
        const until = Math.floor(endMs / 1000);

        const insights = await meta.fetchInstagramAccountInsights(account.external_id, token, since, until, "reach");
        for (const metric of insights.data ?? []) days += store(metric);

        // Total-value metrics (profile views) come from a separate Graph call.
        try {
          const totals = await meta.fetchInstagramAccountTotals(account.external_id, token, since, until);
          const pv = (totals.data ?? []).find((d) => d.name === "profile_views")?.total_value?.value;
          if (pv != null) profileViewsTotal = (profileViewsTotal ?? 0) + pv;
        } catch {
          // profile_views is optional; the time-series sync above still counts.
        }
      }

      // follower_count is only retained for the most recent 30 days.
      try {
        const fc = await meta.fetchInstagramAccountInsights(
          account.external_id,
          token,
          Math.floor((endWindowMs.getTime() - CHUNK_DAYS * 86400000) / 1000),
          Math.floor(endWindowMs.getTime() / 1000),
          "follower_count",
        );
        for (const metric of fc.data ?? []) days += store(metric);
      } catch {
        // follower_count is optional; reach still syncs.
      }

      // Total follower count is an account property, not an insights metric.
      try {
        const details = await meta.fetchInstagramAccountDetails(account.external_id, token);
        const fans = details.followers_count;
        if (fans != null) {
          const today = new Date().toISOString().slice(0, 10);
          const existing = get<{ id: string }>(
            "SELECT id FROM account_metrics WHERE social_account_id = ? AND captured_on = ?",
            [accountId, today],
          );
          if (existing) {
            run("UPDATE account_metrics SET followers = ?, source = 'meta' WHERE id = ?", [fans, existing.id]);
          } else {
            run(
              `INSERT INTO account_metrics (id, workspace_id, social_account_id, platform, captured_on, followers, follower_growth,
                impressions, reach, profile_views, engagement, source)
               VALUES (?,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,'meta')`,
              [uid(), workspaceId, accountId, "instagram", today, fans],
            );
          }
          days += 1;
        }
      } catch {
        // followers_count is optional
      }

      if (profileViewsTotal != null) {
        const today = new Date().toISOString().slice(0, 10);
        const existing = get<{ id: string }>(
          "SELECT id FROM account_metrics WHERE social_account_id = ? AND captured_on = ?",
          [accountId, today],
        );
        if (existing) {
          run("UPDATE account_metrics SET profile_views = ?, source = 'meta' WHERE id = ?", [profileViewsTotal, existing.id]);
        } else {
          run(
            `INSERT INTO account_metrics (id, workspace_id, social_account_id, platform, captured_on, followers, follower_growth,
              impressions, reach, profile_views, engagement, source)
             VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,?,NULL,'meta')`,
            [uid(), workspaceId, accountId, "instagram", today, profileViewsTotal],
          );
        }
        days += 1;
      }

      records += days;
      notes.push(`Instagram account insights imported (${days} datapoints, ${WINDOW_DAYS}-day window).`);
    } catch (err) {
      if (isTokenFailure(err)) {
        run("UPDATE social_accounts SET status = 'reauth_required' WHERE id = ?", [accountId]);
        notes.push("Stored token was rejected by Meta — reconnect this account in Integrations.");
      } else {
        notes.push(`Account insights unavailable: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } else if (account.platform === "facebook" && kind !== "comments") {
    try {
      // Graph caps a single insights window at 30 days, so walk the range in chunks.
      const WINDOW_DAYS = 90;
      const CHUNK_DAYS = 30;
      const startWindowMs = Date.now() - WINDOW_DAYS * 86400000;
      const endWindowMs = Date.now();
      let days = 0;

      for (let startMs = startWindowMs; startMs < endWindowMs; startMs += CHUNK_DAYS * 86400000) {
        const endMs = Math.min(startMs + CHUNK_DAYS * 86400000, endWindowMs);
        const insights = await meta.fetchPageInsights(
          account.external_id,
          token,
          Math.floor(startMs / 1000),
          Math.floor(endMs / 1000),
        );
        for (const metric of insights.data ?? []) {
          // Graph withdrew the classic page_impressions/page_fans metrics; these
          // are the equivalents that v22+ still serves.
          const column =
            metric.name === "page_views_total"
              ? "impressions"
              : metric.name === "page_post_engagements"
                ? "engagement"
                : null;
          if (!column) continue;
          for (const point of metric.values ?? []) {
            if (!point.end_time) continue;
            const capturedOn = point.end_time.slice(0, 10);
            const existing = get<{ id: string }>("SELECT id FROM account_metrics WHERE social_account_id = ? AND captured_on = ?", [
              accountId,
              capturedOn,
            ]);
            if (existing) run(`UPDATE account_metrics SET ${column} = ?, source = 'meta' WHERE id = ?`, [point.value, existing.id]);
            else
              run(
                `INSERT INTO account_metrics (id, workspace_id, social_account_id, platform, captured_on, followers, follower_growth,
                  impressions, reach, profile_views, engagement, source)
                 VALUES (?,?,?,?,?,NULL,?,?,NULL,NULL,?,'meta')`,
                [
                  uid(),
                  workspaceId,
                  accountId,
                  "facebook",
                  capturedOn,
                  null,
                  column === "impressions" ? point.value : null,
                  column === "engagement" ? point.value : null,
                ],
              );
            days += 1;
          }
        }
      }

      // Follower count is a Page property, not an insights metric.
      try {
        const details = await meta.fetchPageDetails(account.external_id, token);
        const fans = details.fan_count ?? details.followers_count;
        if (fans != null) {
          const today = new Date().toISOString().slice(0, 10);
          const existing = get<{ id: string }>("SELECT id FROM account_metrics WHERE social_account_id = ? AND captured_on = ?", [
            accountId,
            today,
          ]);
          if (existing) run("UPDATE account_metrics SET followers = ?, source = 'meta' WHERE id = ?", [fans, existing.id]);
          else
            run(
              `INSERT INTO account_metrics (id, workspace_id, social_account_id, platform, captured_on, followers, follower_growth,
                impressions, reach, profile_views, engagement, source)
               VALUES (?,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,'meta')`,
              [uid(), workspaceId, accountId, "facebook", today, fans],
            );
          days += 1;
        }
      } catch {
        // Follower count is optional; the insights sync above still counts.
      }

      records += days;
      notes.push(`Facebook Page insights imported (${days} datapoints, ${WINDOW_DAYS}-day window).`);
    } catch (err) {
      if (isTokenFailure(err)) {
        run("UPDATE social_accounts SET status = 'reauth_required' WHERE id = ?", [accountId]);
        notes.push("Stored token was rejected by Meta — reconnect this account in Integrations.");
      } else {
        notes.push(`Page insights unavailable: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  }

  if (kind === "comments") {
    // Posts are linked to a connected account through published_posts, not
    // social_posts (which has no account column).
    const posts = all<{ post_id: string; external_post_id: string; social_account_id: string; platform: string }>(
      `SELECT pp.post_id, pp.external_post_id, pp.social_account_id, pp.platform
         FROM published_posts pp
        WHERE pp.workspace_id = ? AND pp.social_account_id = ? AND pp.external_post_id IS NOT NULL
        ORDER BY pp.published_at DESC LIMIT 20`,
      [workspaceId, accountId],
    );
    for (const post of posts) {
      try {
        const comments = await meta.listComments(post.external_post_id, token, 25);
        for (const comment of comments.data ?? []) {
          const commentId = String(comment.id ?? "");
          if (!commentId) continue;
          if (get("SELECT id FROM inbox_conversations WHERE workspace_id = ? AND external_id = ?", [workspaceId, commentId])) continue;
          const from = (comment.from ?? {}) as { id?: string; name?: string; username?: string };
          const text = String(comment.message ?? comment.text ?? "");
          const convId = uid();
          run(
            `INSERT INTO inbox_conversations (id, workspace_id, client_id, social_account_id, platform, external_id, kind, subject,
              participant_name, participant_handle, status, priority, assignee_id, labels, post_ref, first_response_seconds,
              last_message_at, created_at)
             VALUES (?,?,NULL,?,?,?, 'comment', ?, ?, ?, 'open','normal',NULL,NULL,?,NULL,?,?)`,
            [
              convId,
              workspaceId,
              post.social_account_id,
              post.platform,
              commentId,
              text.slice(0, 120) || "New comment",
              from.name ?? from.username ?? "Unknown",
              from.username ? `@${from.username}` : null,
              post.post_id,
              nowIso(),
              nowIso(),
            ],
          );
          run(
            `INSERT INTO inbox_messages (id, conversation_id, direction, author_name, author_external_id, body, external_id, is_read, sent_by, created_at)
             VALUES (?,?,'inbound',?,?,?,?,0,NULL,?)`,
            [uid(), convId, from.name ?? null, from.id ?? null, text, commentId, comment.created_time ?? nowIso()],
          );
          records += 1;
        }
      } catch {
        notes.push("Some comment threads were not readable with the current permissions.");
        break;
      }
    }
  }
  } catch (err) {
    // A rejected or revoked token is not a transient sync error — flag the
    // account so the Integrations screen tells the user to reconnect.
    if (isTokenFailure(err)) {
      run("UPDATE social_accounts SET status = 'reauth_required' WHERE id = ?", [accountId]);
      notes.push("Stored token was rejected by Meta — reconnect this account in Integrations.");
      run("UPDATE social_accounts SET last_synced_at = ? WHERE id = ?", [nowIso(), accountId]);
      return { records, notes };
    }
    throw err;
  }

  run("UPDATE social_accounts SET last_synced_at = ? WHERE id = ?", [nowIso(), accountId]);
  return { records, notes };
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * True when Graph rejected the token itself rather than the request — a revoked,
 * expired or insufficiently-permissioned token needs a reconnect, not a retry.
 */
function isTokenFailure(err: unknown): boolean {
  if (!(err instanceof meta.MetaApiError)) return false;
  const code = err.payload?.code;
  if (code === 190 || code === 191 || code === 4 || code === 100) return true;
  const message = (err.payload?.message ?? "").toLowerCase();
  return (
    message.includes("impersonating a user's page") ||
    message.includes("invalid oauth access token") ||
    message.includes("access token has expired") ||
    message.includes("session has been invalidated") ||
    message.includes("must be granted") ||
    message.includes("insufficient")
  );
}
