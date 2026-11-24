import "server-only";
import { get, nowIso, run, uid } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import * as meta from "@/lib/meta";
import type { AuthContext } from "@/lib/auth";

/**
 * Import a Meta **system-user** token directly, instead of running the OAuth
 * consent flow. This is the fallback for when an account cannot complete the
 * dialog (for example the signing-in user has no role on the app).
 *
 * The pasted token is verified, exchanged for a Page token via /me/accounts and
 * stored encrypted — exactly like the OAuth callback does. It is never logged.
 */
export async function importSystemUserToken(ctx: AuthContext, token: string) {
  const trimmed = token.trim();
  if (trimmed.length < 50) throw new Error("That does not look like a Meta access token");

  const debug = await meta.debugToken(trimmed);
  const info = debug.data ?? {};
  if (!info.is_valid) throw new Error("Meta rejected that token (is_valid = false). Generate a fresh one.");

  const scopes = info.scopes ?? [];
  const required = ["pages_show_list"];
  const missing = required.filter((scope) => !scopes.includes(scope));
  if (missing.length > 0) {
    throw new Error(`Token is missing required permission(s): ${missing.join(", ")}`);
  }

  const pages = await meta.listPages(trimmed);
  if ((pages.data ?? []).length === 0) {
    throw new Error("This token can see no Facebook Pages. Give the system user access to the Page first.");
  }

  const connectionId = uid();
  const scopeString = scopes.join(",");
  const now = nowIso();
  const imported: { platform: string; name: string; externalId: string }[] = [];

  // Parent row must exist before oauth_tokens references it.
  run(
    `INSERT INTO oauth_connections (id, workspace_id, user_id, provider, external_user_id, scopes, expires_at, created_at)
     VALUES (?,?,?,'meta',?,?,NULL,?)`,
    [connectionId, ctx.workspace.id, ctx.user.id, String(info.user_id ?? ""), scopeString, now],
  );

  const storeToken = (accountId: string, pageToken: string) => {
    run("DELETE FROM oauth_tokens WHERE social_account_id = ?", [accountId]);
    run(
      `INSERT INTO oauth_tokens (id, connection_id, social_account_id, provider, access_token_enc, refresh_token_enc,
        token_type, expires_at, scopes, created_at, updated_at)
       VALUES (?,?,?,'meta',?,NULL,'bearer',NULL,?,?,?)`,
      [uid(), connectionId, accountId, encryptSecret(pageToken), scopeString, now, now],
    );
  };

  for (const page of pages.data ?? []) {
    const currentPageToken = page.access_token ?? "";
    if (!currentPageToken) continue;

    const existingFb = get<{ id: string }>(
      "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = 'facebook' AND external_id = ?",
      [ctx.workspace.id, page.id],
    );
    const fbId = existingFb?.id ?? uid();
    if (existingFb) {
      run(
        `UPDATE social_accounts SET name = ?, status = 'connected', scopes = ?, token_expires_at = NULL,
           avatar_url = ?, followers_count = ?, last_synced_at = ?, meta_json = ? WHERE id = ?`,
        [
          page.name,
          scopeString,
          page.picture?.data?.url ?? null,
          page.followers_count ?? page.fan_count ?? null,
          now,
          JSON.stringify({ category: page.category, page_id: page.id }),
          fbId,
        ],
      );
    } else {
      run(
        `INSERT INTO social_accounts (id, workspace_id, client_id, platform, account_type, external_id, name, username,
          avatar_url, followers_count, status, token_expires_at, scopes, meta_json, connected_at, last_synced_at)
         VALUES (?,?,NULL,'facebook','page',?,?,?,?,?,'connected',NULL,?,?,?,?)`,
        [
          fbId,
          ctx.workspace.id,
          page.id,
          page.name,
          page.name,
          page.picture?.data?.url ?? null,
          page.followers_count ?? page.fan_count ?? null,
          scopeString,
          JSON.stringify({ category: page.category, page_id: page.id }),
          now,
          now,
        ],
      );
    }
    storeToken(fbId, currentPageToken);
    imported.push({ platform: "facebook", name: page.name, externalId: page.id });

    const ig = page.instagram_business_account;
    if (ig?.id) {
      const existingIg = get<{ id: string }>(
        "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = 'instagram' AND external_id = ?",
        [ctx.workspace.id, ig.id],
      );
      const igId = existingIg?.id ?? uid();
      if (existingIg) {
        run(
          "UPDATE social_accounts SET name = ?, username = ?, status = 'connected', scopes = ?, token_expires_at = NULL, last_synced_at = ?, meta_json = ? WHERE id = ?",
          [ig.username ?? page.name, ig.username ?? page.name, scopeString, now, JSON.stringify({ page_id: page.id }), igId],
        );
      } else {
        run(
          `INSERT INTO social_accounts (id, workspace_id, client_id, platform, account_type, external_id, name, username,
            avatar_url, followers_count, status, token_expires_at, scopes, meta_json, connected_at, last_synced_at)
           VALUES (?,?,NULL,'instagram','business',?,?,?,?,NULL,'connected',NULL,?,?,?,?)`,
          [
            igId,
            ctx.workspace.id,
            ig.id,
            page.name,
            ig.username ?? page.name,
            ig.profile_picture_url ?? null,
            scopeString,
            JSON.stringify({ page_id: page.id }),
            now,
            now,
          ],
        );
      }
      storeToken(igId, currentPageToken);
      imported.push({ platform: "instagram", name: ig.username ?? page.name, externalId: ig.id });
    }
  }

  if (imported.length === 0) throw new Error("No usable Page token came back for this system user.");

  return { imported: imported.length, accounts: imported, scopes };
}
