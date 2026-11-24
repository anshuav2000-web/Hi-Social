import { all, get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { describeMetaConfig, PERMISSION_SETS } from "@/lib/meta";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { parseJson } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await guard("integration.manage");
    const accounts = all<Record<string, unknown>>(
      `SELECT sa.*, (SELECT COUNT(*) FROM oauth_tokens t WHERE t.social_account_id = sa.id) AS token_count,
              (SELECT expires_at FROM oauth_tokens t WHERE t.social_account_id = sa.id ORDER BY created_at DESC LIMIT 1) AS token_expires_at
         FROM social_accounts sa WHERE sa.workspace_id = ? ORDER BY sa.platform, sa.name`,
      [ctx.workspace.id],
    );
    const syncs = all<Record<string, unknown>>(
      `SELECT sj.*, sa.name AS account_name FROM sync_jobs sj LEFT JOIN social_accounts sa ON sa.id = sj.social_account_id
        WHERE sj.workspace_id = ? ORDER BY sj.created_at DESC LIMIT 25`,
      [ctx.workspace.id],
    );
    const webhooks = all<Record<string, unknown>>(
      `SELECT id, provider, event, status, signature_valid, created_at, error FROM integration_webhooks
        WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY created_at DESC LIMIT 25`,
      [ctx.workspace.id],
    );
    const errors = all<{ error: string | null; finished_at: string | null }>(
      `SELECT error, finished_at FROM sync_jobs WHERE workspace_id = ? AND error IS NOT NULL ORDER BY created_at DESC LIMIT 10`,
      [ctx.workspace.id],
    );
    return ok({
      config: describeMetaConfig(),
      permissionSets: PERMISSION_SETS,
      accounts,
      syncs,
      webhooks,
      errors,
      notes: {
        publishing: "Live publishing requires an approved Meta app, a system-user or long-lived page token, and instagram_content_publish / pages_manage_posts.",
        sandbox: "Accounts without a stored token are in sandbox mode: posts are recorded but never delivered to Meta.",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const disconnectSchema = z.object({ accountId: z.string().min(3), action: z.enum(["disconnect", "reauthorize"]) });

export async function POST(req: Request) {
  try {
    const ctx = await guard("integration.manage");
    const body = await parseJson(req, disconnectSchema);
    const account = get<{ id: string; name: string; client_id: string | null; platform: string }>(
      "SELECT id, name, client_id, platform FROM social_accounts WHERE id = ? AND workspace_id = ?",
      [body.accountId, ctx.workspace.id],
    );
    if (!account) throw new ApiError("Account not found", 404, "not_found");

    if (body.action === "disconnect") {
      run("DELETE FROM oauth_tokens WHERE social_account_id = ?", [body.accountId]);
      run("UPDATE social_accounts SET status = 'disconnected', token_expires_at = NULL WHERE id = ?", [body.accountId]);
      logAudit(ctx, "integration.disconnected", "social_account", body.accountId, { name: account.name }, requestIp(req));
      return ok({ disconnected: true });
    }

    if (body.action === "reauthorize") {
      run("UPDATE social_accounts SET status = 'sandbox', last_synced_at = ? WHERE id = ?", [nowIso(), body.accountId]);
      logAudit(ctx, "integration.reauthorized", "social_account", body.accountId, {}, requestIp(req));
      return ok({ redirectTo: `/integrations?meta=connected&accounts=1` });
    }
  } catch (err) {
    return handleApiError(err);
  }
}

export const dynamic = "force-dynamic";
