import "server-only";
import fs from "node:fs";
import path from "node:path";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { env, metaConfigured } from "@/lib/env";
import { notifyMany, workspaceAdmins } from "@/lib/notifications";
import { runAutomations } from "@/lib/automations";
import * as meta from "@/lib/meta";

export type PublishValidation = { ok: boolean; errors: string[]; warnings: string[] };

const LIMITS: Record<string, { caption: number; label: string }> = {
  instagram: { caption: 2200, label: "Instagram" },
  facebook: { caption: 63206, label: "Facebook Page" },
};

/** Pre-flight checks run before a job is ever queued. */
export function validateForPublish(post: {
  id: string;
  platform: string;
  content_type: string;
  caption: string | null;
  title: string;
  status: string;
  approval_required: number;
  scheduled_at: string | null;
}): PublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const limit = LIMITS[post.platform];

  if (!limit) errors.push(`Publishing to ${post.platform} is not implemented yet. Only Instagram and Facebook Pages are live-capable.`);
  if (!post.caption || post.caption.trim().length === 0) errors.push("Caption is required before publishing.");
  if (limit && post.caption && post.caption.length > limit.caption) {
    errors.push(`Caption exceeds the ${limit.label} limit of ${limit.caption} characters (currently ${post.caption.length}).`);
  }
  if (!["instagram", "facebook"].includes(post.platform)) {
    warnings.push("Platform not supported by the live publisher; delivery will be simulated.");
  }
  if (post.approval_required === 1) {
    const pending = get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM content_approvals WHERE post_id = ? AND status != 'approved'",
      [post.id],
    );
    const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM content_approvals WHERE post_id = ?", [post.id]);
    if (Number(total?.n ?? 0) === 0) {
      errors.push("This post requires approval but has no approval stages recorded. Send it for review first.");
    } else if (Number(pending?.n ?? 0) > 0) {
      errors.push("All approval stages must be approved before this post can be published.");
    }
  }
  if (post.content_type === "reel" || post.content_type === "video") {
    warnings.push("Video uploads must be reachable by Meta over public HTTPS at publish time.");
  }
  if (post.content_type === "carousel") {
    const media = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media WHERE post_id = ?", [post.id]);
    if (Number(media?.n ?? 0) < 2) errors.push("Instagram carousels need at least 2 media items.");
  }
  if (["image", "carousel", "story", "reel"].includes(post.content_type)) {
    const media = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media WHERE post_id = ?", [post.id]);
    if (Number(media?.n ?? 0) === 0) {
      warnings.push("No media attached — delivery will be simulated even for a connected account.");
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function pickAccount(workspaceId: string, postId: string) {
  const post = get<{ platform: string; client_id: string | null }>(
    "SELECT platform, client_id FROM social_posts WHERE id = ? AND workspace_id = ?",
    [postId, workspaceId],
  );
  if (!post) return null;
  return (
    get<{ id: string; status: string; platform: string; client_id: string | null; external_id: string }>(
      `SELECT id, status, platform, client_id, external_id FROM social_accounts
        WHERE workspace_id = ? AND platform = ? AND (client_id = ? OR ? IS NULL)
        ORDER BY CASE status WHEN 'connected' THEN 0 WHEN 'sandbox' THEN 1 ELSE 2 END, connected_at ASC
        LIMIT 1`,
      [workspaceId, post.platform, post.client_id, post.client_id],
    ) ?? null
  );
}

export function enqueue(input: {
  workspaceId: string;
  postId: string;
  accountId: string;
  runAt: string;
  channel: "live" | "sandbox";
  actorId: string;
}) {
  const account = get<{ platform: string; status: string }>(
    "SELECT platform, status FROM social_accounts WHERE id = ? AND workspace_id = ?",
    [input.accountId, input.workspaceId],
  );
  if (!account) throw new Error("Social account not found in this workspace");

  const idempotencyKey = `${input.postId}:${input.accountId}:${input.runAt}`;
  const existing = get<{ id: string; status: string }>(
    "SELECT id, status FROM publishing_jobs WHERE idempotency_key = ?",
    [idempotencyKey],
  );
  if (existing) return { jobId: existing.id, duplicate: true as const };

  // Any earlier pending delivery for this post is superseded — never publish twice.
  run(
    "UPDATE publishing_jobs SET status = 'canceled', finished_at = ?, updated_at = ? WHERE post_id = ? AND status IN ('queued','running')",
    [nowIso(), nowIso(), input.postId],
  );

  const jobId = uid();
  run(
    `INSERT INTO publishing_jobs (id, workspace_id, post_id, social_account_id, platform, status, run_at,
      attempts, max_attempts, idempotency_key, channel, created_at, updated_at)
     VALUES (?,?,?,?,?,'queued',?,0,5,?,?,?,?)`,
    [
      jobId,
      input.workspaceId,
      input.postId,
      input.accountId,
      account.platform,
      input.runAt,
      idempotencyKey,
      input.channel,
      nowIso(),
      nowIso(),
    ],
  );
  run("UPDATE social_posts SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", [
    input.runAt,
    nowIso(),
    input.postId,
    input.workspaceId,
  ]);
  return { jobId, duplicate: false as const };
}

export function isQueuePaused(workspaceId: string): boolean {
  const row = get<{ is_paused: number }>("SELECT is_paused FROM queue_state WHERE workspace_id = ?", [workspaceId]);
  return Boolean(row?.is_paused);
}

type JobRow = {
  id: string;
  workspace_id: string;
  post_id: string;
  social_account_id: string;
  platform: string;
  status: string;
  run_at: string;
  attempts: number;
  max_attempts: number;
  channel: string;
};

const backoffMinutes = [1, 5, 15, 60, 240];
let tickInFlight = false;

/** Atomically claim and execute one batch of due jobs. Idempotent and safe to call concurrently. */
export async function runPublishingTick(workspaceId?: string): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (tickInFlight) return { processed: 0, succeeded: 0, failed: 0 };
  tickInFlight = true;
  try {
    const due = all<JobRow>(
      `SELECT * FROM publishing_jobs
        WHERE status = 'queued' AND run_at <= ?
          ${workspaceId ? "AND workspace_id = ?" : ""}
          AND workspace_id NOT IN (SELECT workspace_id FROM queue_state WHERE is_paused = 1)
        ORDER BY run_at ASC LIMIT 10`,
      workspaceId ? [nowIso(), workspaceId] : [nowIso()],
    );

    let succeeded = 0;
    let failed = 0;
    for (const job of due) {
      const claim = run(
        "UPDATE publishing_jobs SET status = 'running', locked_at = ?, worker_id = ?, updated_at = ? WHERE id = ? AND status = 'queued'",
        [nowIso(), `worker-${process.pid}`, nowIso(), job.id],
      );
      if (claim.changes === 0) continue;
      const ok = await executeJob(job);
      if (ok) succeeded += 1;
      else failed += 1;
    }
    return { processed: due.length, succeeded, failed };
  } finally {
    tickInFlight = false;
  }
}

async function executeJob(job: JobRow): Promise<boolean> {
  const startedAt = nowIso();
  const attemptNo = job.attempts + 1;
  const post = get<{
    id: string;
    caption: string | null;
    content_type: string;
    title: string;
    external_post_id: string | null;
    approval_required: number;
    scheduled_at: string | null;
    platform: string;
    status: string;
    workspace_id: string;
    reviewer_id: string | null;
    assigned_writer_id: string | null;
  }>("SELECT * FROM social_posts WHERE id = ?", [job.post_id]);

  if (!post) {
    finalize(job, "dead", "Post no longer exists");
    return false;
  }

  const validation = validateForPublish(post);
  const account = get<{ id: string; external_id: string; status: string; name: string; platform: string }>(
    "SELECT id, external_id, status, name, platform FROM social_accounts WHERE id = ?",
    [job.social_account_id],
  );

  if (!validation.ok) {
    recordAttempt(job.id, attemptNo, "failed", null, null, validation.errors.join(" · "), startedAt);
    return retryOrDead(job, attemptNo, validation.errors.join(" · "));
  }

  // Decide delivery channel: real Graph call only when app + account are live.
  const token = account ? liveTokenFor(account.id) : null;
  const canDeliverLive = Boolean(
    metaConfigured() && token && account?.status === "connected" && job.platform !== "sandbox",
  );

  if (canDeliverLive && token && account) {
    try {
      const media = all<{ url: string | null; mime_type: string | null }>(
        `SELECT m.url, m.mime_type FROM post_media pm JOIN media_assets m ON m.id = pm.media_asset_id
          WHERE pm.post_id = ? ORDER BY pm.position ASC`,
        [job.post_id],
      );
      const caption = post.caption ?? "";
      let externalId = "";
      let permalink: string | null = null;

      if (job.platform === "facebook") {
        if (media.length > 0 && media[0]!.url) {
          const res = await meta.publishFacebookPhoto(account.external_id, token, {
            url: absoluteUrl(media[0]!.url),
            caption,
          });
          externalId = res.post_id ?? res.id;
        } else {
          const res = await meta.publishFacebookPagePost(account.external_id, token, { message: caption });
          externalId = res.id;
        }
      } else if (job.platform === "instagram") {
        externalId = await deliverInstagram(account.external_id, token, post.content_type, caption, media);
        const link = await meta.getInstagramPermalink(token, externalId).catch(() => ({ permalink: undefined }));
        permalink = link.permalink ?? null;
      } else {
        throw new Error(`No live publisher for ${job.platform}`);
      }

      recordAttempt(job.id, attemptNo, "succeeded", 200, JSON.stringify({ externalId }), null, startedAt);
      completeJob(job, post, "live", externalId, permalink);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Meta error";
      const status = err instanceof meta.MetaApiError ? err.status : null;
      recordAttempt(job.id, attemptNo, "failed", status, JSON.stringify((err as meta.MetaApiError)?.payload ?? null), message, startedAt);
      if (err instanceof meta.MetaApiError && [4, 17, 32, 613].includes(err.payload.code ?? 0)) {
        // Platform rate limit — back off without burning the attempt budget.
        requeue(job, attemptNo, `Rate limited by Meta: ${message}`, true);
        return false;
      }
      return retryOrDead(job, attemptNo, message);
    }
  }

  // Sandbox / simulated delivery: recorded honestly, never claimed as a live post.
  const now = nowIso();
  recordAttempt(
    job.id,
    attemptNo,
    "succeeded",
    null,
    JSON.stringify({ channel: "sandbox", note: "Simulated delivery — no live Meta credentials for this account" }),
    null,
    startedAt,
  );
  completeJob(job, post, "sandbox", null, null, now);
  return true;
}

async function deliverInstagram(
  igUserId: string,
  token: string,
  contentType: string,
  caption: string,
  media: { url: string | null; mime_type: string | null }[],
): Promise<string> {
  const urls = media.map((m) => (m.url ? absoluteUrl(m.url) : "")).filter(Boolean);
  if (contentType === "carousel") {
    const children: string[] = [];
    for (const url of urls) {
      const item = await meta.createInstagramContainer(igUserId, token, {
        mediaType: "IMAGE",
        imageUrl: url,
        isCarouselItem: true,
      });
      children.push(item.id);
    }
    const container = await meta.createInstagramContainer(igUserId, token, {
      mediaType: "CAROUSEL",
      caption,
      children,
    });
    await waitForContainer(token, container.id);
    const published = await meta.publishInstagramContainer(igUserId, token, container.id);
    return published.id;
  }
  const isVideo = contentType === "reel" || contentType === "video";
  const container = await meta.createInstagramContainer(igUserId, token, {
    mediaType: contentType === "reel" ? "REELS" : contentType === "story" ? "STORIES" : isVideo ? "VIDEO" : "IMAGE",
    imageUrl: isVideo ? undefined : urls[0],
    videoUrl: isVideo ? urls[0] : undefined,
    caption,
  });
  await waitForContainer(token, container.id);
  const published = await meta.publishInstagramContainer(igUserId, token, container.id);
  return published.id;
}

async function waitForContainer(token: string, containerId: string, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const status = await meta.getInstagramContainerStatus(token, containerId).catch(() => null);
    const code = status?.status_code;
    if (!code || code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram container ${code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function absoluteUrl(url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${env.appOrigin.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function liveTokenFor(accountId: string): string | null {
  const row = get<{ access_token_enc: string; expires_at: string | null }>(
    `SELECT access_token_enc, expires_at FROM oauth_tokens WHERE social_account_id = ?
      ORDER BY created_at DESC LIMIT 1`,
    [accountId],
  );
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  try {
    return decryptSecret(row.access_token_enc);
  } catch {
    return null;
  }
}

function recordAttempt(
  jobId: string,
  attemptNo: number,
  status: string,
  httpStatus: number | null,
  body: string | null,
  error: string | null,
  startedAt: string,
) {
  run(
    `INSERT INTO publishing_attempts (id, job_id, attempt_no, status, http_status, response_body, error, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [uid(), jobId, attemptNo, status, httpStatus, body, error, startedAt, nowIso()],
  );
}

function completeJob(
  job: JobRow,
  post: { id: string; workspace_id: string; reviewer_id: string | null; assigned_writer_id: string | null },
  channel: "live" | "sandbox",
  externalId: string | null,
  permalink: string | null,
  at = nowIso(),
) {
  run("UPDATE publishing_jobs SET status = 'succeeded', attempts = attempts + 1, finished_at = ?, updated_at = ?, last_error = NULL WHERE id = ?", [
    at,
    at,
    job.id,
  ]);
  run(
    `INSERT INTO published_posts (id, workspace_id, post_id, social_account_id, platform, external_post_id, url, channel, published_at, raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [uid(), job.workspace_id, post.id, job.social_account_id, job.platform, externalId, permalink, channel, at, JSON.stringify({ channel })],
  );
  run("UPDATE social_posts SET status = 'published', published_at = ?, external_post_id = ?, external_url = ?, updated_at = ? WHERE id = ?", [
    at,
    externalId,
    permalink,
    at,
    post.id,
  ]);
  notifyMany([post.reviewer_id, post.assigned_writer_id], {
    workspaceId: job.workspace_id,
    kind: "publish_succeeded",
    title: channel === "live" ? "Post published" : "Post delivered (sandbox)",
    body:
      channel === "live"
        ? "The platform confirmed the publish. External ID recorded."
        : "Simulated delivery recorded — connect a live Meta account to publish for real.",
    link: "/publishing-queue",
  });
  runAutomations(job.workspace_id, "publish.succeeded", {
    jobId: job.id,
    postId: post.id,
    platform: job.platform,
    channel,
  });
}

function retryOrDead(job: JobRow, attemptNo: number, message: string): boolean {
  if (attemptNo >= job.max_attempts) {
    finalize(job, "dead", message);
    run("UPDATE social_posts SET status = 'failed', updated_at = ? WHERE id = ?", [nowIso(), job.post_id]);
    notifyMany(workspaceAdmins(job.workspace_id), {
      workspaceId: job.workspace_id,
      kind: "publish_failed",
      title: "Publishing moved to dead letter",
      body: `${message} — retry from the publishing queue after fixing the cause.`,
      link: "/publishing-queue",
    });
    runAutomations(job.workspace_id, "publish.failed", { jobId: job.id, postId: job.post_id, attempts: attemptNo });
    return false;
  }
  requeue(job, attemptNo, message, false);
  runAutomations(job.workspace_id, "publish.failed", { jobId: job.id, postId: job.post_id, attempts: attemptNo });
  return false;
}

function requeue(job: JobRow, attemptNo: number, message: string, rateLimited: boolean) {
  const delay = rateLimited ? 15 : backoffMinutes[Math.min(attemptNo - 1, backoffMinutes.length - 1)] ?? 5;
  const nextRun = new Date(Date.now() + delay * 60_000).toISOString();
  run(
    `UPDATE publishing_jobs SET status = 'queued', attempts = ?, run_at = ?, last_error = ?, locked_at = NULL, updated_at = ? WHERE id = ?`,
    [rateLimited ? job.attempts : attemptNo, nextRun, message, nowIso(), job.id],
  );
}

function finalize(job: JobRow, status: "dead" | "canceled", message: string) {
  run("UPDATE publishing_jobs SET status = ?, last_error = ?, finished_at = ?, updated_at = ? WHERE id = ?", [
    status,
    message,
    nowIso(),
    nowIso(),
    job.id,
  ]);
}

/** Local media path for the live publisher (Meta fetches over HTTPS in production). */
export function localMediaPath(url: string): string | null {
  const id = url.split("/").pop();
  if (!id) return null;
  const asset = get<{ storage_path: string | null }>("SELECT storage_path FROM media_assets WHERE id = ?", [id]);
  if (!asset?.storage_path) return null;
  const root = env.storageDir || path.join(process.cwd(), "storage", "uploads");
  return path.join(root, asset.storage_path);
}

export function readMediaFile(url: string): Buffer | null {
  const p = localMediaPath(url);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
