import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export function signMediaUrl(assetId: string, ttlMs = 3600_000): string {
  const expires = Date.now() + ttlMs;
  const secret = env.encryptionKey || "socialhub-dev-signed-urls";
  const sig = createHmac("sha256", secret).update(`${assetId}:${expires}`).digest("hex").slice(0, 40);
  return `/api/v1/media/file/${assetId}?expires=${expires}&sig=${sig}`;
}
