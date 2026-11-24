import { z } from "zod";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import {
  addPostComment,
  attachMedia,
  detachMedia,
  duplicatePost,
  getPostDetail,
  schedulePost,
  setPostStatus,
  submitForReview,
  updatePost,
} from "@/lib/posts";
import { hasPermission } from "@/lib/auth";
import { ApiError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum([
    "submit_review",
    "set_status",
    "schedule",
    "publish_now",
    "duplicate",
    "comment",
    "attach_media",
    "detach_media",
    "assign",
    "unschedule",
  ]),
  status: z.string().optional(),
  scheduledAt: z.string().optional(),
  channel: z.enum(["auto", "sandbox"]).optional(),
  confirmSandbox: z.boolean().optional(),
  body: z.string().max(4000).optional(),
  assetId: z.string().optional(),
  writerId: z.string().nullable().optional(),
  designerId: z.string().nullable().optional(),
  reviewerId: z.string().nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = await parseJson(req, schema);
    const ip = requestIp(req);

    if (["schedule", "publish_now", "unschedule"].includes(payload.action)) {
      const ctx = await guard("content.publish");
      if (payload.action === "unschedule") {
        const detail = await getPostDetail(ctx, id);
        const jobs = detail.jobs as { id: string; status: string }[];
        const queued = jobs.filter((j) => ["queued", "running"].includes(j.status));
        if (queued.length === 0) throw new ApiError("No active publishing job to cancel", 422, "no_job");
        const { run } = await import("@/lib/db");
        for (const job of queued) {
          run("UPDATE publishing_jobs SET status = 'canceled', finished_at = ?, updated_at = ? WHERE id = ?", [
            new Date().toISOString(),
            new Date().toISOString(),
            job.id,
          ]);
        }
        run("UPDATE social_posts SET status = 'approved', scheduled_at = NULL, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          id,
        ]);
        return ok({ canceled: queued.length });
      }
      if (payload.action === "schedule" && !payload.scheduledAt) {
        throw new ApiError("scheduledAt is required", 422, "missing_schedule");
      }
      const result = schedulePost(
        ctx,
        id,
        { scheduledAt: payload.scheduledAt ?? new Date().toISOString(), channel: payload.channel },
        ip,
        payload.action === "publish_now",
      );
      return ok(result);
    }

    const ctx = await guard("content.write");
    switch (payload.action) {
      case "submit_review":
        return ok(submitForReview(ctx, id, ip));
      case "set_status":
        if (!payload.status) throw new ApiError("status is required", 422, "missing_status");
        return ok(setPostStatus(ctx, id, payload.status, ip));
      case "duplicate":
        return ok(duplicatePost(ctx, id, ip));
      case "comment":
        if (!payload.body?.trim()) throw new ApiError("Comment cannot be empty", 422, "empty_comment");
        return ok(addPostComment(ctx, id, payload.body, ip));
      case "attach_media":
        if (!payload.assetId) throw new ApiError("assetId is required", 422, "missing_asset");
        return ok(attachMedia(ctx, id, payload.assetId, ip));
      case "detach_media":
        if (!payload.assetId) throw new ApiError("assetId is required", 422, "missing_asset");
        return ok(detachMedia(ctx, id, payload.assetId, ip));
      case "assign":
        return ok(
          updatePost(
            ctx,
            id,
            { assigned_writer_id: payload.writerId, assigned_designer_id: payload.designerId, reviewer_id: payload.reviewerId },
            ip,
          ),
        );
      default:
        throw new ApiError("Unsupported action", 400, "unknown_action");
    }
  } catch (err) {
    return handleApiError(err);
  }
}
