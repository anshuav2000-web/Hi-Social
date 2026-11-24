import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { all, ensureBootstrapped, get, nowIso, run, uid } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { verifyPassword } from "@/lib/password.mjs";
import { can, ROLE_LABELS, type Permission, type RoleKey } from "@/lib/rbac";

export const SESSION_COOKIE = "shp_session";
export const WORKSPACE_COOKIE = "shp_ws";
const SESSION_DAYS = 14;

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_color: string;
  timezone: string;
  is_super_admin: number;
  notification_prefs: string;
  job_title: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  is_demo: number;
  role_key: RoleKey;
  role_label: string;
  client_scope: string | null;
};

export type AuthContext = {
  user: AuthUser;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  permissions: Permission[];
};

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?)",
    [uid(), userId, sha256(token), expires.toISOString(), ip ?? null, userAgent ?? null, nowIso()],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

// ── Password reset ─────────────────────────────────────────
const RESET_TOKEN_MINUTES = 30;

/** Issue a single-use reset token. Returns the raw token (never stored in clear). */
export function issuePasswordResetToken(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000);
  run(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?,?,?,?,NULL,?)",
    [uid(), userId, sha256(token), expires.toISOString(), nowIso()],
  );
  return token;
}

/** Consume a reset token: returns the user id when valid and unused, otherwise null. */
export function consumePasswordResetToken(token: string) {
  const row = get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?",
    [sha256(token)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  run("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", [nowIso(), row.id]);
  return row.user_id;
}

/** True when the deployment can deliver email (SMTP configured). */
export function emailDeliveryEnabled() {
  return Boolean(env.smtpUrl);
}

export async function loginWithPassword(email: string, password: string) {
  await ensureBootstrapped();
  const user = get<AuthUser & { password_hash: string }>(
    "SELECT * FROM users WHERE lower(email) = lower(?) AND is_active = 1",
    [email.trim()],
  );
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  run("UPDATE users SET last_login_at = ? WHERE id = ?", [nowIso(), user.id]);
  return user;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  await ensureBootstrapped();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = get<{ user_id: string; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
    [sha256(token)],
  );
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
    return null;
  }
  const user = get<AuthUser>(
    "SELECT id, email, full_name, avatar_color, timezone, is_super_admin, notification_prefs, job_title FROM users WHERE id = ? AND is_active = 1",
    [session.user_id],
  );
  if (!user) return null;

  const memberships = all<{
    workspace_id: string;
    role_key: RoleKey;
    client_scope: string | null;
    name: string;
    slug: string;
    is_demo: number;
  }>(
    `SELECT wm.workspace_id, wm.role_key, wm.client_scope, w.name, w.slug, w.is_demo
       FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? AND wm.status = 'active'
      ORDER BY w.created_at ASC`,
    [user.id],
  );
  if (memberships.length === 0) return null;

  const preferred = jar.get(WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.workspace_id === preferred) ?? memberships[0]!;
  const workspaces: WorkspaceSummary[] = memberships.map((m) => ({
    id: m.workspace_id,
    name: m.name,
    slug: m.slug,
    is_demo: m.is_demo,
    role_key: m.role_key,
    role_label: ROLE_LABELS[m.role_key] ?? m.role_key,
    client_scope: m.client_scope,
  }));

  const perms = all<{ permission_key: string }>(
    "SELECT permission_key FROM role_permissions WHERE role_key = ?",
    [active.role_key],
  ).map((r) => r.permission_key as Permission);

  return {
    user,
    workspace: workspaces.find((w) => w.id === active.workspace_id)!,
    workspaces,
    permissions: user.is_super_admin ? (Object.keys(ROLE_LABELS).length ? perms : perms) : perms,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, permission)) redirect("/dashboard?denied=" + permission);
  return ctx;
}

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  if (ctx.user.is_super_admin) return true;
  return ctx.permissions.includes(permission) || can(ctx.workspace.role_key, permission);
}

export async function requireUserForApi(): Promise<AuthContext | null> {
  return getAuthContext();
}

export async function clientScopeFor(ctx: AuthContext): Promise<string[] | null> {
  if (ctx.workspace.role_key !== "client_viewer") return null;
  if (!ctx.workspace.client_scope) return [];
  return ctx.workspace.client_scope.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
