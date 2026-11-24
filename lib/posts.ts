import "server-only";
import { z } from "zod";
import { all, get, nowIso, run, transaction, uid } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { runAutomations } from "@/lib/automations";
import type { AuthContext } from "@/lib/auth";
import { enqueue, pickAccount, validateForPublish } from "@/lib/publishing";
import { POST_STATUSES } from "@/lib/utils";

export const postCreateSchema = z.object({
  title: z.string().min(2).max(200),
  client_id: z.string().min(2).nullable().optional(),
  campaign_id: z.string().nullable().optional(),
  platform: z.enum(["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "pinterest", "threads"]),
  content_type: z.enum(["image", "carousel", "reel", "video", "story", "text", "link"]),
  content_pillar: z.string().max(80).nullable().optional(),
  caption: z.string().max(2200).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  hashtags: z.string().max(2000).nullable().optional(),
  mentions: z.string().max(500).nullable().optional(),
  cta: z.string().max(200).nullable().optional(),
  location_name: z.string().max(200).nullable().optional(),
  internal_notes: z.string().max(4000).nullable().optional(),
  first_comment: z.string().max(2200).nullable().optional(),
  alt_text: z.string().max(1000).nullable().optional(),
  status: z.enum(POST_STATUSES).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigned_writer_id: z.string().nullable().optional(),
  assigned_designer_id: z.string().nullable().optional(),
  reviewer_id: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  timezone: z.string().max(60).optional(),
  approval_required: z.boolean().optional(),
  brief: z.string().max(8000).nullable().optional(),
  creative_requirements: z.string().max(4000).nullable().optional(),
  target_audience: z.string().max(1000).nullable().optional(),
  reference_files: z.string().max(2000).nullable().optional(),
  media_asset_ids: z.array(z.string()).max(10).optional(),
  idea_id: z.string().nullable().optional(),
});

export const postPatchSchema = postCreateSchema.partial();

export type PostCreate = z.infer<typeof postCreateSchema>;

const TRANSITIONS: Record<string, string[]> = {
  idea: ["planned", "draft", "archived"],
  planned: ["idea", "draft", "in_creation", "archived"],
  draft: ["planned", "in_creation", "review", "archived"],
  in_creation: ["draft", "review", "archived"],
  review: ["approved", "changes_requested", "in_creation", "archived"],
  changes_requested: ["in_creation", "review", "draft", "archived"],
  approved: ["scheduled", "published", "review", "archived"],
  scheduled: ["approved", "failed", "published", "archived"],
  published: ["archived"],
  failed: ["scheduled", "approved", "archived"],
  archived: ["planned", "draft"],
};

export function assertTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = TRANSITIONS[from];
  if (!allowed) throw new ApiError(`Unknown status “${from}”`, 422, "invalid_status");
  if (!allowed.includes(to)) {
    throw new ApiError(`Cannot move a post from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`, 422, "invalid_transition");
  }
}

function assertClient(ctx: AuthContext, clientId?: string | null) {
  if (!clientId) return;
  const row = get<{ id: string }>("SELECT id FROM clients WHERE id = ? AND workspace_id = ?", [clientId, ctx.workspace.id]);
  if (!row) throw new ApiError("Client not found in this workspace", 422, "invalid_client");
}

export function createPost(ctx: AuthContext, input: PostCreate, ip?: string) {
  assertClient(ctx, input.client_id);
  if (input.campaign_id) {
    const cmp = get<{ id: string }>("SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?", [input.campaign_id, ctx.workspace.id]);
    if (!cmp) throw new ApiError("Campaign not found in this workspace", 422, "invalid_campaign");
  }
  if (input.campaign_id === undefined || input.campaign_id === null) {
    // allow a campaign to be inferred only when explicitly provided; never guess.
  }
  const client = input.client_id
    ? get<{ approval_required: number; approval_stages: string }>(
        "SELECT approval_required, approval_stages FROM clients WHERE id = ?",
        [input.client_id],
      )
    : null;
  const approvalRequired = input.approval_required ?? Boolean(client?.approval_required ?? 1);
  const id = uid();
  const now = nowIso();
  const status = input.status ?? "draft";

  transaction(() => {
    run(
      `INSERT INTO social_posts (id, workspace_id, client_id, campaign_id, title, caption, description, hashtags, mentions, cta,
        location_name, platform, content_type, content_pillar, internal_notes, first_comment, alt_text, status, priority,
        assigned_writer_id, assigned_designer_id, reviewer_id, deadline, scheduled_at, timezone, published_at, external_post_id,
        external_url, media_ready, approval_required, created_by, created_at, updated_at, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?,?,NULL)`,
      [
        id,
        ctx.workspace.id,
        input.client_id ?? null,
        input.campaign_id ?? null,
        input.title,
        input.caption ?? null,
        input.description ?? null,
        input.hashtags ?? null,
        input.mentions ?? null,
        input.cta ?? null,
        input.location_name ?? null,
        input.platform,
        input.content_type,
        input.content_pillar ?? null,
        input.internal_notes ?? null,
        input.first_comment ?? null,
        input.alt_text ?? null,
        status,
        input.priority ?? "medium",
        input.assigned_writer_id ?? null,
        input.assigned_designer_id ?? null,
        input.reviewer_id ?? null,
        input.deadline ?? null,
        input.scheduled_at ?? null,
        input.timezone ?? "UTC",
        input.media_asset_ids && input.media_asset_ids.length > 0 ? 1 : 0,
        approvalRequired ? 1 : 0,
        ctx.user.id,
        now,
        now,
      ],
    );

    if (input.campaign_id) {
      run("INSERT OR IGNORE INTO campaign_posts (id, campaign_id, post_id) VALUES (?,?,?)", [uid(), input.campaign_id, id]);
    }

    if (input.brief || input.creative_requirements || input.target_audience || input.reference_files) {
      run(
        `INSERT INTO content_briefs (id, workspace_id, post_id, brief, creative_requirements, reference_files, target_audience, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          uid(),
          ctx.workspace.id,
          id,
          input.brief ?? null,
          input.creative_requirements ?? null,
          input.reference_files ?? null,
          input.target_audience ?? null,
          now,
        ],
      );
    }

    (input.media_asset_ids ?? []).forEach((assetId, index) => {
      const asset = get<{ id: string }>("SELECT id FROM media_assets WHERE id = ? AND workspace_id = ?", [assetId, ctx.workspace.id]);
      if (!asset) throw new ApiError("Media asset not found in this workspace", 422, "invalid_media");
      run("INSERT INTO post_media (id, post_id, media_asset_id, position, role) VALUES (?,?,?,?,?)", [
        uid(),
        id,
        assetId,
        index,
        index === 0 ? "primary" : "attachment",
      ]);
      run("UPDATE media_assets SET usage_count = usage_count + 1 WHERE id = ?", [assetId]);
    });

    run(
      `INSERT INTO content_versions (id, post_id, version_no, snapshot_json, changed_by, created_at) VALUES (?,?,1,?,?,?)`,
      [uid(), id, JSON.stringify({ title: input.title, caption: input.caption ?? null, status }), ctx.user.id, now],
    );

    if (input.idea_id) {
      run("UPDATE content_ideas SET status = 'planned' WHERE id = ? AND workspace_id = ?", [input.idea_id, ctx.workspace.id]);
    }
  });

  logAudit(ctx, "post.created", "social_post", id, { title: input.title, platform: input.platform, status }, ip);
  runAutomations(ctx.workspace.id, "post.created", { postId: id, platform: input.platform, client_id: input.client_id ?? null });
  return getPostDetail(ctx, id);
}

export function updatePost(ctx: AuthContext, id: string, input: Record<string, unknown>, ip?: string) {
  const existing = get<Record<string, unknown>>("SELECT * FROM social_posts WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
  if (!existing) throw new ApiError("Post not found", 404, "not_found");
  if (input.client_id) assertClient(ctx, String(input.client_id));

  const allowed = [
    "title",
    "client_id",
    "campaign_id",
    "caption",
    "description",
    "hashtags",
    "mentions",
    "cta",
    "location_name",
    "platform",
    "content_type",
    "content_pillar",
    "internal_notes",
    "first_comment",
    "alt_text",
    "priority",
    "assigned_writer_id",
    "assigned_designer_id",
    "reviewer_id",
    "deadline",
    "scheduled_at",
    "timezone",
    "media_ready",
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (key in input) {
      sets.push(`${key} = ?`);
      params.push(input[key] === "" ? null : input[key]);
    }
  }
  if (sets.length === 0 && !input.brief) throw new ApiError("No changes supplied", 422, "empty_payload");

  transaction(() => {
    if (sets.length > 0) {
      run(`UPDATE social_posts SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...params, nowIso(), id]);
    }
    const brief = (input.brief ?? input.creative_requirements ?? input.target_audience ?? input.reference_files) !== undefined;
    if (brief) {
      const existingBrief = get<{ id: string }>("SELECT id FROM content_briefs WHERE post_id = ?", [id]);
      if (existingBrief) {
        run(
          `UPDATE content_briefs SET brief = COALESCE(?, brief), creative_requirements = COALESCE(?, creative_requirements),
             target_audience = COALESCE(?, target_audience), reference_files = COALESCE(?, reference_files), updated_at = ? WHERE post_id = ?`,
          [
            (input.brief as string) ?? null,
            (input.creative_requirements as string) ?? null,
            (input.target_audience as string) ?? null,
            (input.reference_files as string) ?? null,
            nowIso(),
            id,
          ],
        );
      } else {
        run(
          `INSERT INTO content_briefs (id, workspace_id, post_id, brief, creative_requirements, reference_files, target_audience, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [uid(), ctx.workspace.id, id, (input.brief as string) ?? null, (input.creative_requirements as string) ?? null, (input.reference_files as string) ?? null, (input.target_audience as string) ?? null, nowIso()],
        );
      }
    }
    // Snapshot every meaningful edit for version history.
    const versionRow = get<{ n: number }>("SELECT COUNT(*) AS n FROM content_versions WHERE post_id = ?", [id]);
    const next = Number(versionRow?.n ?? 0) + 1;
    const fresh = get<Record<string, unknown>>("SELECT title, caption, status FROM social_posts WHERE id = ?", [id]);
    run("INSERT INTO content_versions (id, post_id, version_no, snapshot_json, changed_by, created_at) VALUES (?,?,?,?,?,?)", [
      uid(),
      id,
      next,
      JSON.stringify(fresh),
      ctx.user.id,
      nowIso(),
    ]);
  });

  logAudit(ctx, "post.updated", "social_post", id, { fields: Object.keys(input) }, ip);
  return getPostDetail(ctx, id);
}

export function getPostDetail(ctx: AuthContext, id: string) {
  const post = get<
    Record<string, unknown> & {
      client_name: string | null;
      campaign_name: string | null;
      writer_name: string | null;
      designer_name: string | null;
      reviewer_name: string | null;
    }
  >(
    `SELECT p.*, c.name AS client_name, cmp.name AS campaign_name,
            w.full_name AS writer_name, d.full_name AS designer_name, r.full_name AS reviewer_name
       FROM social_posts p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN campaigns cmp ON cmp.id = p.campaign_id
       LEFT JOIN users w ON w.id = p.assigned_writer_id
       LEFT JOIN users d ON d.id = p.assigned_designer_id
       LEFT JOIN users r ON r.id = p.reviewer_id
      WHERE p.id = ? AND p.workspace_id = ?`,
    [id, ctx.workspace.id],
  );
  if (!post) throw new ApiError("Post not found", 404, "not_found");
  const media = all<Record<string, unknown>>(
    `SELECT m.*, pm.role, pm.position FROM post_media pm JOIN media_assets m ON m.id = pm.media_asset_id
      WHERE pm.post_id = ? ORDER BY pm.position ASC`,
    [id],
  );
  const brief = get("SELECT * FROM content_briefs WHERE post_id = ?", [id]);
  const versions = all("SELECT id, version_no, changed_by, created_at, snapshot_json FROM content_versions WHERE post_id = ? ORDER BY version_no DESC", [id]);
  const comments = all(
    `SELECT cc.*, u.full_name, u.avatar_color FROM content_comments cc JOIN users u ON u.id = cc.user_id
      WHERE cc.post_id = ? ORDER BY cc.created_at ASC`,
    [id],
  );
  const approvals = all(
    `SELECT ca.*, u.full_name AS reviewer_name FROM content_approvals ca LEFT JOIN users u ON u.id = ca.reviewer_id
      WHERE ca.post_id = ? ORDER BY ca.created_at ASC`,
    [id],
  );
  const jobs = all(
    "SELECT * FROM publishing_jobs WHERE post_id = ? ORDER BY created_at DESC",
    [id],
  );
  const published = all("SELECT * FROM published_posts WHERE post_id = ? ORDER BY published_at DESC", [id]);
  return { post, media, brief, versions, comments, approvals, jobs, published };
}

export function submitForReview(ctx: AuthContext, id: string, ip?: string) {
  const post = get<{
    id: string;
    status: string;
    client_id: string | null;
    approval_required: number;
    reviewer_id: string | null;
    title: string;
    assigned_writer_id: string | null;
    assigned_designer_id: string | null;
  }>("SELECT * FROM social_posts WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
  if (!post) throw new ApiError("Post not found", 404, "not_found");
  assertTransition(post.status, "review");

  const stages = post.client_id
    ? (get<{ approval_stages: string }>("SELECT approval_stages FROM clients WHERE id = ?", [post.client_id])?.approval_stages ??
        "internal_review")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["internal_review"];
  const existing = all<{ stage: string }>("SELECT stage FROM content_approvals WHERE post_id = ?", [id]).map((r) => r.stage);

  transaction(() => {
    run("UPDATE social_posts SET status = 'review', updated_at = ? WHERE id = ?", [nowIso(), id]);
    for (const stage of stages) {
      if (existing.includes(stage)) {
        run("UPDATE content_approvals SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE post_id = ? AND stage = ?", [id, stage]);
      } else {
        run(
          `INSERT INTO content_approvals (id, workspace_id, post_id, stage, status, reviewer_id, decided_by, feedback, due_at, created_at, decided_at)
           VALUES (?,?,?,?,'pending',?,NULL,NULL,?,?,NULL)`,
          [uid(), ctx.workspace.id, id, stage, stage.includes("client") ? null : post.reviewer_id, new Date(Date.now() + 2 * 86400000).toISOString(), nowIso()],
        );
      }
    }
  });

  notifyMany([post.reviewer_id], {
    workspaceId: ctx.workspace.id,
    kind: "approval_requested",
    title: "Post submitted for review",
    body: `“${post.title}” is waiting on ${stages[0]?.replace(/_/g, " ")}.`,
    link: "/approvals",
  });
  logAudit(ctx, "post.submitted_for_review", "social_post", id, { stages }, ip);
  runAutomations(ctx.workspace.id, "post.review_requested", { postId: id, client_id: post.client_id });
  return getPostDetail(ctx, id);
}

export function setPostStatus(ctx: AuthContext, id: string, status: string, ip?: string) {
  if (!(POST_STATUSES as readonly string[]).includes(status)) throw new ApiError("Unknown status", 422, "invalid_status");
  const post = get<{ status: string; title: string }>("SELECT status, title FROM social_posts WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
  if (!post) throw new ApiError("Post not found", 404, "not_found");
  assertTransition(post.status, status);
  if (status === "published") {
    throw new ApiError("Publishing happens through the publishing queue so the platform can confirm delivery.", 422, "use_publisher");
  }
  run("UPDATE social_posts SET status = ?, updated_at = ?, archived_at = ? WHERE id = ?", [
    status,
    nowIso(),
    status === "archived" ? nowIso() : null,
    id,
  ]);
  logAudit(ctx, "post.status_changed", "social_post", id, { from: post.status, to: status }, ip);
  if (status === "approved") runAutomations(ctx.workspace.id, "post.approved", { postId: id });
  if (status === "changes_requested") runAutomations(ctx.workspace.id, "post.rejected", { postId: id });
  return getPostDetail(ctx, id);
}

export function schedulePost(
  ctx: AuthContext,
  id: string,
  input: { scheduledAt: string; channel?: "auto" | "sandbox" },
  ip?: string,
  now = false,
) {
  const detail = getPostDetail(ctx, id);
  const post = detail.post as unknown as {
    id: string;
    title: string;
    platform: string;
    content_type: string;
    caption: string | null;
    status: string;
    approval_required: number;
    scheduled_at: string | null;
  };
  if (["archived", "published"].includes(post.status)) {
    throw new ApiError(`Cannot schedule a ${post.status} post.`, 422, "invalid_status");
  }
  const validation = validateForPublish(post);
  if (!validation.ok) throw new ApiError("Pre-flight validation failed", 422, "publish_validation", validation.errors);

  const account = pickAccount(ctx.workspace.id, id);
  if (!account) throw new ApiError("No social account is available for this platform in the workspace.", 422, "no_account");
  const channel: "live" | "sandbox" = account.status === "connected" && input.channel !== "sandbox" ? "live" : "sandbox";
  if (channel === "sandbox" && input.channel === "sandbox" ? false : channel === "sandbox" && account.status !== "connected") {
    // Sandbox is the only option here; the response tells the UI to label it clearly.
  }

  const runAt = now ? new Date().toISOString() : new Date(input.scheduledAt).toISOString();
  if (Number.isNaN(new Date(runAt).getTime())) throw new ApiError("Invalid schedule time", 422, "invalid_time");

  const result = enqueue({
    workspaceId: ctx.workspace.id,
    postId: id,
    accountId: account.id,
    runAt,
    channel,
    actorId: ctx.user.id,
  });
  logAudit(ctx, now ? "post.publish_queued" : "post.scheduled", "social_post", id, { runAt, channel, duplicate: result.duplicate }, ip);
  notifyMany([(detail.post as { assigned_writer_id?: string }).assigned_writer_id], {
    workspaceId: ctx.workspace.id,
    kind: "post_scheduled",
    title: now ? "Publish queued" : "Post scheduled",
    body: `“${post.title}” → ${new Date(runAt).toLocaleString("en-US")} (${channel === "live" ? "live Meta delivery" : "sandbox delivery"}).`,
    link: "/publishing-queue",
  });
  return { ...result, channel, validation, runAt };
}

export function duplicatePost(ctx: AuthContext, id: string, ip?: string) {
  const detail = getPostDetail(ctx, id);
  const post = detail.post as Record<string, unknown>;
  const newId = uid();
  const now = nowIso();
  transaction(() => {
    run(
      `INSERT INTO social_posts (id, workspace_id, client_id, campaign_id, title, caption, description, hashtags, mentions, cta,
        location_name, platform, content_type, content_pillar, internal_notes, first_comment, alt_text, status, priority,
        assigned_writer_id, assigned_designer_id, reviewer_id, deadline, scheduled_at, timezone, published_at, external_post_id,
        external_url, media_ready, approval_required, created_by, created_at, updated_at, archived_at)
       SELECT ?, workspace_id, client_id, campaign_id, ?, caption, description, hashtags, mentions, cta, location_name, platform,
        content_type, content_pillar, internal_notes, first_comment, alt_text, 'draft', priority, assigned_writer_id,
        assigned_designer_id, reviewer_id, deadline, NULL, timezone, NULL, NULL, NULL, media_ready, approval_required, ?, ?, ?, NULL
       FROM social_posts WHERE id = ?`,
      [newId, `${String(post.title)} (copy)`, ctx.user.id, now, now, id],
    );
    for (const asset of detail.media as { id: string; position: number }[]) {
      run("INSERT INTO post_media (id, post_id, media_asset_id, position, role) VALUES (?,?,?,?,'attachment')", [
        uid(),
        newId,
        asset.id,
        asset.position,
      ]);
    }
    const briefRow = detail.brief as Record<string, unknown> | null;
    if (briefRow) {
      run(
        `INSERT INTO content_briefs (id, workspace_id, post_id, brief, creative_requirements, reference_files, target_audience, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [uid(), ctx.workspace.id, newId, briefRow.brief, briefRow.creative_requirements, briefRow.reference_files, briefRow.target_audience, now],
      );
    }
    run("INSERT INTO content_versions (id, post_id, version_no, snapshot_json, changed_by, created_at) VALUES (?,?,1,?,?,?)", [
      uid(),
      newId,
      JSON.stringify({ source: id, title: post.title }),
      ctx.user.id,
      now,
    ]);
  });
  logAudit(ctx, "post.duplicated", "social_post", newId, { source: id }, ip);
  return getPostDetail(ctx, newId);
}

export function addPostComment(ctx: AuthContext, id: string, body: string, ip?: string) {
  const post = get<{ id: string }>("SELECT id FROM social_posts WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
  if (!post) throw new ApiError("Post not found", 404, "not_found");
  run("INSERT INTO content_comments (id, post_id, user_id, body, created_at) VALUES (?,?,?,?,?)", [uid(), id, ctx.user.id, body.slice(0, 4000), nowIso()]);
  logAudit(ctx, "post.comment_added", "social_post", id, {}, ip);
  return getPostDetail(ctx, id);
}

export function attachMedia(ctx: AuthContext, id: string, assetId: string, ip?: string) {
  const asset = get<{ id: string }>("SELECT id FROM media_assets WHERE id = ? AND workspace_id = ?", [assetId, ctx.workspace.id]);
  if (!asset) throw new ApiError("Media asset not found", 404, "not_found");
  const pos = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media WHERE post_id = ?", [id]);
  run("INSERT INTO post_media (id, post_id, media_asset_id, position, role) VALUES (?,?,?,?,'attachment')", [
    uid(),
    id,
    assetId,
    Number(pos?.n ?? 0),
  ]);
  run("UPDATE media_assets SET usage_count = usage_count + 1 WHERE id = ?", [assetId]);
  run("UPDATE social_posts SET media_ready = 1, updated_at = ? WHERE id = ?", [nowIso(), id]);
  logAudit(ctx, "post.media_attached", "social_post", id, { assetId }, ip);
  return getPostDetail(ctx, id);
}

export function detachMedia(ctx: AuthContext, id: string, assetId: string, ip?: string) {
  run("DELETE FROM post_media WHERE post_id = ? AND media_asset_id = ?", [id, assetId]);
  const left = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media WHERE post_id = ?", [id]);
  run("UPDATE social_posts SET media_ready = ?, updated_at = ? WHERE id = ?", [Number(left?.n ?? 0) > 0 ? 1 : 0, nowIso(), id]);
  logAudit(ctx, "post.media_detached", "social_post", id, { assetId }, ip);
  return getPostDetail(ctx, id);
}
