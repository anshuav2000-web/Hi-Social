import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { get } from "@/lib/db";
import { env } from "@/lib/env";
import { getAuthContext } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

function key() {
  return env.encryptionKey || "socialhub-dev-signed-urls";
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const asset = get<{ storage_path: string | null; mime_type: string; workspace_id: string }>(
    "SELECT storage_path, mime_type, workspace_id FROM media_assets WHERE id = ?",
    [id],
  );
  if (!asset || !asset.storage_path) return new Response("Not found", { status: 404 });

  const expires = Number(url.searchParams.get("expires") || 0);
  const sig = url.searchParams.get("sig") || "";
  let authorized = false;
  if (expires && sig) {
    const expected = createHmac("sha256", key()).update(`${id}:${expires}`).digest("hex").slice(0, 40);
    authorized = expires > Date.now() && sig === expected;
  }
  if (!authorized) {
    const ctx = await getAuthContext();
    authorized = Boolean(ctx && ctx.workspace.id === asset.workspace_id);
  }
  if (!authorized) return new Response("Forbidden", { status: 403 });

  const root = env.storageDir || path.join(process.cwd(), "storage", "uploads");
  const abs = path.join(root, asset.storage_path);
  if (!abs.startsWith(root) || !fs.existsSync(abs)) return new Response("Not found", { status: 404 });
  const data = fs.readFileSync(abs);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": asset.mime_type,
      "content-length": String(data.length),
      "cache-control": "private, max-age=300",
    },
  });
}
