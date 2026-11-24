import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/** True when SMTP_URL is set — the only condition under which the app can deliver email. */
export function smtpConfigured() {
  return Boolean(env.smtpUrl);
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  if (!env.smtpUrl) throw new Error("SMTP_URL is not configured");
  const transporter = nodemailer.createTransport(env.smtpUrl);
  try {
    const info = await transporter.sendMail({
      from: env.smtpFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { messageId: info.messageId };
  } finally {
    transporter.close();
  }
}

export function passwordResetEmail(link: string) {
  return {
    subject: "Reset your SocialHub Pro password",
    text:
      `A password reset was requested for your workspace.\n\n` +
      `Open this single-use link within 30 minutes:\n${link}\n\n` +
      `If you did not request this, ignore this email — the link expires and nothing changes.`,
    html:
      `<p>A password reset was requested for your workspace.</p>` +
      `<p><a href="${link}">Reset password</a></p>` +
      `<p>This single-use link expires in 30 minutes. If you did not request it, ignore this email.</p>`,
  };
}

export function reportEmail(input: { name: string; period: string; downloadUrl: string }) {
  return {
    subject: `SocialHub Pro report — ${input.name} (${input.period})`,
    text: `Your report "${input.name}" for ${input.period} is ready.\n\nDownload: ${input.downloadUrl}`,
    html: `<p>Your report <strong>${input.name}</strong> for ${input.period} is ready.</p><p><a href="${input.downloadUrl}">Download the report</a></p>`,
  };
}
