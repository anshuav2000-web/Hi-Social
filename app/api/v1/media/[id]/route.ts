import { z } from "zod";
import { get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { signMediaUrl } from "@/lib/media";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("media.read");
    const asset = get<Record<string, unknown>>("SELECT * FROM media_assets WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL", [
      id,
      ctx.workspace.id,
    ]);
    if (!asset) throw new ApiError("Asset not found", 404, "not_found");
    const usage = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media WHERE media_asset_id = ?", [id]);
    const posts = get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media pm JOIN social_posts p ON p.id = pm.post_id WHERE pm.media_asset_id = ?", [id]);
    return ok({ asset, usageCount: usage?.n ?? 0, postCount: posts?.n ?? 0, signedUrl: signMediaUrl(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tags: z.string().max(500).optional(),
  alt_text: z.string().max(1000).optional(),
  folder_id: z.string().nullable().optional(),
  client_id: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("media.write");
    const body = await parseJson(req, patchSchema);
    const existing = get<{ id: string }>("SELECT id FROM media_assets WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
    if (!existing) throw new ApiError("Asset not found", 404, "not_found");
    const sets: string[] = [];
    const params2: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      sets.push(`${key} = ?`);
      params2.push(value === "" ? null : value);
    }
    if (sets.length === 0) throw new ApiError("No changes supplied", 422, "empty_payload");
    run(`UPDATE media_assets SET ${sets.join(", ")} WHERE id = ?`, [...params2, id]);
    logAudit(ctx, "media.updated", "media_asset", id, body, requestIp(req));
    return ok(get("SELECT * FROM media_assets WHERE id = ?", [id]));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("media.write");
    const existing = get<{ id: string }>("SELECT id FROM media_assets WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
    if (!existing) throw new ApiError("Asset not found", 404, "not_found");
    run("UPDATE media_assets SET deleted_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), id]);
    logAudit(ctx, "media.deleted", "media_asset", id, {}, requestIp(req));
    return ok({ id, deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
