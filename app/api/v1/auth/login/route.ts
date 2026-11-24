import { z } from "zod";
import { created, fail, handleApiError, ok, parseJson, rateLimit, requestIp } from "@/lib/http";
import { createSession, loginWithPassword } from "@/lib/auth";
import { logSecurityEvent } from "@/lib/audit";
import { ensureBootstrapped } from "@/lib/db";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    await ensureBootstrapped();
    const ip = requestIp(req);
    if (!rateLimit(`login:${ip}`, 10, 60_000)) {
      logSecurityEvent(null, null, "login_rate_limited", "warning", "Too many login attempts", ip);
      return fail("Too many attempts. Try again in a minute.", 429, "rate_limited");
    }
    const body = await parseJson(req, schema);
    const user = await loginWithPassword(body.email, body.password);
    if (!user) {
      logSecurityEvent(null, null, "login_failed", "warning", `Failed sign-in for ${body.email}`, ip);
      return fail("Email or password is incorrect", 401, "invalid_credentials");
    }
    await createSession(user.id, ip, req.headers.get("user-agent") ?? undefined);
    logSecurityEvent(null, user.id, "login_succeeded", "info", "Password sign-in", ip);
    return created({ id: user.id, email: user.email, full_name: user.full_name });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  return ok({ message: "POST email + password to sign in" });
}
