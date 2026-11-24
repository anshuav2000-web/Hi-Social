import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Symmetric encryption for OAuth access tokens at rest (AES-256-GCM).
 * The key comes from APP_ENCRYPTION_KEY, or a locally generated key file
 * (data/.encryption-key) for zero-config local installs.
 */
let cachedKey: Buffer | null = null;

function localKeyPath() {
  const dbPath = env.databasePath || path.join(process.cwd(), "data", "socialhub.db");
  return path.join(path.dirname(dbPath), ".encryption-key");
}

function key(): Buffer {
  if (cachedKey) return cachedKey;
  if (env.encryptionKey) {
    cachedKey = createHash("sha256").update(env.encryptionKey).digest();
    return cachedKey;
  }
  const file = localKeyPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (raw.length >= 32) {
        cachedKey = Buffer.from(raw, "hex");
        if (cachedKey.length === 32) return cachedKey;
      }
    }
    const fresh = randomBytes(32);
    fs.writeFileSync(file, fresh.toString("hex"), { mode: 0o600 });
    cachedKey = fresh;
    return cachedKey;
  } catch {
    cachedKey = createHash("sha256").update("socialhub-pro-dev-fallback-key").digest();
    return cachedKey;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Malformed ciphertext");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

export const hmacSha256 = (secret: string, body: string) =>
  createHmac("sha256", secret).update(body, "utf8").digest();

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
