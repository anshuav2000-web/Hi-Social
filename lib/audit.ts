import "server-only";
import { nowIso, run, uid } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";

export function logAudit(
  ctx: Pick<AuthContext, "user" | "workspace"> | { user: { id: string }; workspace: { id: string } },
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  ip?: string,
) {
  run(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata_json, ip, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      uid(),
      ctx.workspace.id,
      ctx.user.id,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      ip ?? null,
      nowIso(),
    ],
  );
}

export function logSecurityEvent(
  workspaceId: string | null,
  userId: string | null,
  kind: string,
  severity: "info" | "warning" | "critical",
  detail: string,
  ip?: string,
) {
  run(
    `INSERT INTO security_events (id, workspace_id, user_id, kind, severity, detail, ip, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [uid(), workspaceId, userId, kind, severity, detail, ip ?? null, nowIso()],
  );
}
