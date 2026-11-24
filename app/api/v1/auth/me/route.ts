import { handleApiError, ok } from "@/lib/http";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return ok(null);
    return ok({
      user: { id: ctx.user.id, email: ctx.user.email, full_name: ctx.user.full_name, avatar_color: ctx.user.avatar_color },
      workspace: ctx.workspace,
      workspaces: ctx.workspaces,
      permissions: ctx.permissions,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
