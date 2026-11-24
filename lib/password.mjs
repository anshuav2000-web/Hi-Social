import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing shared by the Next.js server and the standalone seed script.
 * Format: scrypt$<saltHex>$<hashHex>
 */
export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt.toString("hex")}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(String(password), salt, 64);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
