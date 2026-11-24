import { all, get } from "@/lib/db";
import { created, handleApiError, ok, requestIp } from "@/lib/http";
import { guard, scopedClientIds } from "@/lib/api-guard";
import { createPost, postCreateSchema } from "@/lib/posts";
import { ApiError } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const ctx = await guard("content.read");
    const url = new URL(req.url);
    const where: string[] = ["p.workspace_id = ?"];
    const params: unknown[] = [ctx.workspace.id];

    const scoped = scopedClientIds(ctx);
    if (scoped !== null) {
      if (scoped.length === 0) where.push("1 = 0");
      else {
        where.push(`p.client_id IN (${scoped.map(() => "?").join(",")})`);
        params.push(...scoped);
      }
    }

    for (const key of ["status", "platform", "client_id", "campaign_id", "content_type", "assigned_writer_id", "assigned_designer_id"]) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      if (key === "status") {
        const list = value.split(",").filter(Boolean);
        where.push(`p.status IN (${list.map(() => "?").join(",")})`);
        params.push(...list);
      } else {
        where.push(`p.${key} = ?`);
        params.push(value);
      }
    }

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from) {
      where.push("COALESCE(p.scheduled_at, p.deadline, p.created_at) >= ?");
      params.push(from);
    }
    if (to) {
      where.push("COALESCE(p.scheduled_at, p.deadline, p.created_at) <= ?");
      params.push(to);
    }
    const q = (url.searchParams.get("q") || "").trim();
    if (q) {
      where.push("(p.title LIKE ? OR p.caption LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200) || 200));
    const rows = all(
      `SELECT p.*, c.name AS client_name, cmp.name AS campaign_name,
              (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
              (SELECT COUNT(*) FROM content_approvals ca WHERE ca.post_id = p.id AND ca.status = 'pending') AS pending_approvals,
              (SELECT COUNT(*) FROM content_comments cc WHERE cc.post_id = p.id) AS comment_count,
              (SELECT channel FROM published_posts pp WHERE pp.post_id = p.id ORDER BY published_at DESC LIMIT 1) AS publish_channel
         FROM social_posts p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN campaigns cmp ON cmp.id = p.campaign_id
        WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(p.scheduled_at, p.deadline, p.created_at) ASC LIMIT ?`,
      [...params, limit],
    );
    const total = get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM social_posts p WHERE ${where.join(" AND ")}`,
      params,
    );
    return ok({ rows, total: total?.n ?? rows.length });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await guard("content.write");
    const raw = await req.json().catch(() => null);
    if (raw === null) throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
    const parsed = postCreateSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
    const detail = createPost(ctx, parsed.data, requestIp(req));
    return created(detail);
  } catch (err) {
    return handleApiError(err);
  }
}
