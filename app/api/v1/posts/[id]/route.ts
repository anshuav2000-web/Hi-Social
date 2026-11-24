import { run } from "@/lib/db";
import { handleApiError, ok, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { getPostDetail, postPatchSchema, updatePost } from "@/lib/posts";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("content.read");
    return ok(getPostDetail(ctx, id));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("content.write");
    const raw = await req.json().catch(() => null);
    if (raw === null) throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
    const parsed = postPatchSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
    return ok(updatePost(ctx, id, parsed.data as Record<string, unknown>, requestIp(req)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("content.write");
    run("UPDATE social_posts SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", [
      new Date().toISOString(),
      new Date().toISOString(),
      id,
      ctx.workspace.id,
    ]);
    logAudit(ctx, "post.archived", "social_post", id, {}, requestIp(req));
    return ok({ id, status: "archived" });
  } catch (err) {
    return handleApiError(err);
  }
}
