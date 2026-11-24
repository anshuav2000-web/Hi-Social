import { z } from "zod";
import { guard } from "@/lib/api-guard";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { importSystemUserToken } from "@/lib/meta-import";

const schema = z.object({ token: z.string().min(50, "That does not look like an access token").max(4000) });

/**
 * Fallback connection path: paste a Meta system-user token instead of running
 * the OAuth dialog. Useful when the signing-in user has no role on the app.
 */
export async function POST(req: Request) {
  try {
    const ctx = await guard("integration.manage");
    const body = await parseJson(req, schema);
    const result = await importSystemUserToken(ctx, body.token);
    logAudit(ctx, "integration.token_imported", "oauth_connection", ctx.workspace.id, { imported: result.imported }, requestIp(req));
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
