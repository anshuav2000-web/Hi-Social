import { cookies } from "next/headers";
import { z } from "zod";
import { nowIso, run } from "@/lib/db";
import { guard } from "@/lib/api-guard";
import { ApiError, handleApiError, ok } from "@/lib/http";
import { isConfigured, oauthDialogUrl, PERMISSION_SETS } from "@/lib/meta";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";

const schema = z.object({ flow: z.enum(["facebook", "instagram"]).default("facebook") });

export async function POST(req: Request) {
  try {
    const ctx = await guard("integration.manage");
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError("Invalid flow", 422, "validation_failed", parsed.error.issues);

    if (!isConfigured()) {
      run("UPDATE social_accounts SET status = 'sandbox', last_synced_at = ? WHERE workspace_id = ?", [nowIso(), ctx.workspace.id]);
      return ok({ url: "/integrations?meta=connected&accounts=5", state: "sandbox" });
    }
    if (parsed.data.flow === "instagram" && !env.meta.instagramLogin) {
      throw new ApiError("Instagram Login flow is disabled (META_ENABLE_INSTAGRAM_LOGIN=false).", 422, "flow_disabled");
    }

    const state = randomToken(24);
    const jar = await cookies();
    jar.set("shp_oauth_state", `${state}:${ctx.user.id}:${parsed.data.flow}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return ok({ url: oauthDialogUrl(parsed.data.flow, state), state });
  } catch (err) {
    return handleApiError(err);
  }
}
