import { z } from "zod";
import { fail, handleApiError, ok, parseJson, rateLimit, requestIp } from "@/lib/http";
import { get, nowIso, run } from "@/lib/db";
import { consumePasswordResetToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password.mjs";
import { logSecurityEvent } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function POST(req: Request) {
  try {
    const ip = requestIp(req);
    if (!rateLimit(`reset:${ip}`, 5, 60_000)) return fail("Too many attempts, try again shortly", 429, "rate_limited");
    const body = await parseJson(req, schema);

    const userId = consumePasswordResetToken(body.token);
    if (!userId) return fail("This reset link is invalid or has expired.", 400, "invalid_token");

    const user = get<{ id: string }>("SELECT id FROM users WHERE id = ? AND is_active = 1", [userId]);
    if (!user) return fail("This reset link is invalid or has expired.", 400, "invalid_token");

    run("UPDATE users SET password_hash = ?, last_login_at = ? WHERE id = ?", [
      hashPassword(body.password),
      nowIso(),
      user.id,
    ]);
    // Revoke every existing session so a leaked link cannot leave a live session behind.
    run("DELETE FROM sessions WHERE user_id = ?", [user.id]);

    logSecurityEvent(null, user.id, "password_reset_completed", "info", "Password changed via reset link", ip);
    return ok({ reset: true });
  } catch (err) {
    return handleApiError(err);
  }
}
