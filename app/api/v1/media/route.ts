import fs from "node:fs";
import path from "node:path";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { created, fail, handleApiError, ok } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/crypto";
import { imageSize } from "@/lib/image";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "video/mp4", "video/quicktime", "video/webm"]);

function storageRoot() {
  const dir = env.storageDir || path.join(process.cwd(), "storage", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function GET(req: Request) {
  try {
    const ctx = await guard("media.read");
    const url = new URL(req.url);
    const where = ["workspace_id = ?", "deleted_at IS NULL"];
    const params: unknown[] = [ctx.workspace.id];
    const q = (url.searchParams.get("q") || "").trim();
    if (q) {
      where.push("(name LIKE ? OR tags LIKE ? OR alt_text LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    for (const key of ["folder_id", "client_id", "kind"]) {
      const value = url.searchParams.get(key);
      if (value) {
        where.push(`${key} = ?`);
        params.push(value);
      }
    }
    const rows = all(
      `SELECT * FROM media_assets WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 300`,
      params,
    );
    return ok({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await guard("media.write");
    const form = await req.formData().catch(() => null);
    if (!form) throw new ApiError("Upload must be multipart/form-data", 400, "invalid_form");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("A file is required", 422, "missing_file");
    if (file.size > MAX_BYTES) throw new ApiError("File exceeds the 25 MB limit", 413, "too_large");
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED.has(mime)) throw new ApiError(`Unsupported file type: ${mime}`, 415, "unsupported_type");

    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = sha256(buffer);
    const duplicate = get<{ id: string; name: string }>(
      "SELECT id, name FROM media_assets WHERE workspace_id = ? AND checksum = ? AND deleted_at IS NULL",
      [ctx.workspace.id, checksum],
    );
    if (duplicate) {
      return fail(`This file already exists as “${duplicate.name}”.`, 409, "duplicate_asset", { assetId: duplicate.id });
    }

    const id = uid();
    const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
    const rel = path.join("workspace", ctx.workspace.id, `${id}${ext}`);
    const abs = path.join(storageRoot(), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);

    const dims = mime.startsWith("image/") ? imageSize(buffer) : null;
    const folderId = String(form.get("folder_id") || "") || null;
    const clientId = String(form.get("client_id") || "") || null;
    const tags = String(form.get("tags") || "") || null;
    const altText = String(form.get("alt_text") || "") || null;

    run(
      `INSERT INTO media_assets (id, workspace_id, client_id, folder_id, name, kind, mime_type, size_bytes, width, height,
        storage_path, url, thumb_url, tags, alt_text, checksum, usage_count, uploaded_by, created_at, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,NULL)`,
      [
        id,
        ctx.workspace.id,
        clientId,
        folderId,
        file.name.slice(0, 200),
        mime.startsWith("video/") ? "video" : "image",
        mime,
        file.size,
        dims?.width ?? null,
        dims?.height ?? null,
        rel,
        `/api/v1/media/file/${id}`,
        `/api/v1/media/file/${id}`,
        tags,
        altText,
        checksum,
        ctx.user.id,
        nowIso(),
      ],
    );
    logAudit(ctx, "media.uploaded", "media_asset", id, { name: file.name, size: file.size, mime }, undefined);
    return created(get("SELECT * FROM media_assets WHERE id = ?", [id]));
  } catch (err) {
    return handleApiError(err);
  }
}
