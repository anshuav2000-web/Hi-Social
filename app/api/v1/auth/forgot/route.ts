import { z } from "zod";
import { fail, handleApiError, ok, parseJson, rateLimit, requestIp } from "@/lib/http";
import { get } from "@/lib/db";
import { emailDeliveryEnabled, issuePasswordResetToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { logSecurityEvent } from "@/lib/audit";
import { passwordResetEmail, sendEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    const ip = requestIp(req);
    if (!rateLimit(`forgot:${ip}`, 5, 60_000)) return fail("Too many attempts, try again shortly", 429, "rate_limited");
    const body = await parseJson(req, schema);

    const user = get<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE lower(email) = lower(?) AND is_active = 1",
      [body.email.trim()],
    );

    // Same response either way, so the endpoint cannot be used to probe addresses.
    if (!user) return ok({ sent: true, delivery: "none" });

    const token = issuePasswordResetToken(user.id);
    const link = `${env.appOrigin.replace(/\/$/, "")}/reset-password?token=${token}`;
    logSecurityEvent(null, user.id, "password_reset_requested", "info", "Password reset requested", ip);

    if (!emailDeliveryEnabled()) {
      // No SMTP configured: hand the link back so a local install is not locked out.
      return ok({
        sent: true,
        delivery: "dev_link",
        link,
        note: "SMTP is not configured, so the reset link is shown here instead of emailed. Configure SMTP_URL to deliver it by email.",
      });
    }

    logSecurityEvent(null, user.id, "password_reset_email", "info", "Password reset link sent by email", ip);
    const message = passwordResetEmail(link);
    await sendEmail({ to: user.email, ...message });
    return ok({ sent: true, delivery: "smtp" });
  } catch (err) {
    return handleApiError(err);
  }
}
