import { z } from "zod";
import { cookies } from "next/headers";
import { handleApiError, ok, parseJson } from "@/lib/http";
import { getAuthContext, WORKSPACE_COOKIE } from "@/lib/auth";
import { ApiError } from "@/lib/http";

const schema = z.object({ workspaceId: z.string().min(3) });

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new ApiError("Authentication required", 401, "unauthenticated");
    const { workspaceId } = await parseJson(req, schema);
    if (!ctx.workspaces.some((w) => w.id === workspaceId)) {
      throw new ApiError("You are not a member of that workspace", 403, "forbidden");
    }
    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
    return ok({ workspaceId });
  } catch (err) {
    return handleApiError(err);
  }
}
