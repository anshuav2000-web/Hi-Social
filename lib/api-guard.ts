import "server-only";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import type { Permission } from "@/lib/rbac";

export async function guard(permission?: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new ApiError("Authentication required", 401, "unauthenticated");
  if (permission && !hasPermission(ctx, permission)) {
    throw new ApiError("You do not have permission to perform this action", 403, "forbidden");
  }
  return ctx;
}

/** Client-viewer accounts may only see rows for their scoped clients. */
export function scopedClientIds(ctx: AuthContext): string[] | null {
  if (ctx.workspace.role_key !== "client_viewer") return null;
  if (!ctx.workspace.client_scope) return [];
  return ctx.workspace.client_scope.split(",").map((s) => s.trim()).filter(Boolean);
}
