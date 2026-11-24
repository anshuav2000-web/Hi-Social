import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { env, metaConfigured } from "@/lib/env";
import * as meta from "@/lib/meta";
import { logAudit } from "@/lib/audit";
import { env as appEnv } from "@/lib/env";

function redirect(path: string) {
  return NextResponse.redirect(`${appEnv.appOrigin.replace(/\/$/, "")}${path}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getAuthContext();
  if (!ctx) return redirect("/login?next=/integrations");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) return redirect(`/integrations?meta=error&reason=${encodeURIComponent(error)}`);

  const jar = await cookies();
  const stored = jar.get("shp_oauth_state")?.value;
  jar.delete("shp_oauth_state");
  if (!stored || !state || !stored.startsWith(`${state}:`)) {
    return redirect("/integrations?meta=error&reason=state_mismatch");
  }
  const [, storedUser, flow] = stored.split(":");
  if (storedUser !== ctx.user.id) return redirect("/integrations?meta=error&reason=state_user_mismatch");
  if (!code) return redirect("/integrations?meta=error&reason=missing_code");
  if (!metaConfigured()) return redirect("/integrations?meta=error&reason=not_configured");

  try {
    const tokenResponse = flow === "instagram"
      ? await meta.exchangeCode(code)
      : await meta.exchangeForLongLivedToken((await meta.exchangeCode(code)).access_token);
    const accessToken = tokenResponse.access_token;
    const expiresAt =
      tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString() : null;

    const debug = await meta.debugToken(accessToken).catch(() => null);
    const scopes = debug?.data?.scopes?.join(",") ?? "";
    const externalUserId = debug?.data?.user_id ?? null;

    const connectionId = uid();
    run(
      `INSERT INTO oauth_connections (id, workspace_id, user_id, provider, external_user_id, scopes, expires_at, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [connectionId, ctx.workspace.id, ctx.user.id, "meta", externalUserId, scopes, expiresAt, nowIso()],
    );

    let imported = 0;
    if (flow === "facebook") {
      const pages = await meta.listPages(accessToken);
      for (const page of pages.data ?? []) {
        const pageToken = page.access_token;
        const pageExpires = pageToken === accessToken ? expiresAt : null;
        const existing = get<{ id: string }>(
          "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = 'facebook' AND external_id = ?",
          [ctx.workspace.id, page.id],
        );
        const accountId = existing?.id ?? uid();
        if (existing) {
          run(
            `UPDATE social_accounts SET name = ?, username = ?, status = 'connected', token_expires_at = ?,
               scopes = ?, meta_json = ?, last_synced_at = ? WHERE id = ?`,
            [page.name, page.name, pageExpires, scopes, JSON.stringify({ category: page.category, page_id: page.id }), nowIso(), accountId],
          );
        } else {
          run(
            `INSERT INTO social_accounts (id, workspace_id, client_id, platform, account_type, external_id, name, username,
              avatar_url, followers_count, status, token_expires_at, scopes, meta_json, connected_at, last_synced_at)
             VALUES (?,?,NULL,'facebook','page',?,?,?,?,?,'connected',?,?,?,?,?)`,
            [
              accountId,
              ctx.workspace.id,
              page.id,
              page.name,
              page.name,
              page.picture?.data?.url ?? null,
              page.followers_count ?? page.fan_count ?? null,
              pageExpires,
              scopes,
              JSON.stringify({ category: page.category, page_id: page.id }),
              nowIso(),
              nowIso(),
            ],
          );
        }
        run(
          `INSERT INTO oauth_tokens (id, connection_id, social_account_id, provider, access_token_enc, refresh_token_enc, token_type, expires_at, scopes, created_at, updated_at)
           VALUES (?,?,?,'meta',?,NULL,'bearer',?,?,?,?)`,
          [uid(), connectionId, accountId, encryptSecret(pageToken), pageExpires, scopes, nowIso(), nowIso()],
        );
        imported += 1;

        // Instagram professional account linked to this page.
        const ig = (page as unknown as { instagram_business_account?: { id: string } }).instagram_business_account;
        if (ig?.id) {
          const igExisting = get<{ id: string }>(
            "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = 'instagram' AND external_id = ?",
            [ctx.workspace.id, ig.id],
          );
          const igAccountId = igExisting?.id ?? uid();
          if (igExisting) {
            run("UPDATE social_accounts SET status = 'connected', scopes = ?, last_synced_at = ? WHERE id = ?", [scopes, nowIso(), igAccountId]);
          } else {
            run(
              `INSERT INTO social_accounts (id, workspace_id, client_id, platform, account_type, external_id, name, username,
                avatar_url, followers_count, status, token_expires_at, scopes, meta_json, connected_at, last_synced_at)
               VALUES (?,?,NULL,'instagram','business',?,?,?,NULL,NULL,'connected',?,?,?,?,?)`,
              [
                igAccountId,
                ctx.workspace.id,
                ig.id,
                page.name,
                page.name,
                pageExpires,
                scopes,
                JSON.stringify({ page_id: page.id }),
                nowIso(),
                nowIso(),
              ],
            );
          }
          run(
            `INSERT INTO oauth_tokens (id, connection_id, social_account_id, provider, access_token_enc, refresh_token_enc, token_type, expires_at, scopes, created_at, updated_at)
             VALUES (?,?,?,'meta',?,NULL,'bearer',?,?,?,?)`,
            [uid(), connectionId, igAccountId, encryptSecret(pageToken), pageExpires, scopes, nowIso(), nowIso()],
          );
          imported += 1;
        }
      }
    } else {
      // Instagram Login flow: a single professional account.
      const me = await fetch(
        `https://graph.instagram.com/${env.meta.graphVersion}/me?fields=user_id,username,account_type,profile_picture_url,followers_count&access_token=${encodeURIComponent(accessToken)}`,
      ).then((r) => r.json() as Promise<Record<string, unknown>>);
      const externalId = String(me.user_id ?? me.id ?? externalUserId ?? "");
      if (externalId) {
        const existing = get<{ id: string }>(
          "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = 'instagram' AND external_id = ?",
          [ctx.workspace.id, externalId],
        );
        const accountId = existing?.id ?? uid();
        if (existing) {
          run("UPDATE social_accounts SET status = 'connected', scopes = ?, last_synced_at = ? WHERE id = ?", [scopes, nowIso(), accountId]);
        } else {
          run(
            `INSERT INTO social_accounts (id, workspace_id, client_id, platform, account_type, external_id, name, username,
              avatar_url, followers_count, status, token_expires_at, scopes, meta_json, connected_at, last_synced_at)
             VALUES (?,?,NULL,'instagram',?,?,?,?,?,?,'connected',?,?,?,?,?)`,
            [
              accountId,
              ctx.workspace.id,
              String(me.account_type ?? "business").toLowerCase(),
              externalId,
              String(me.username ?? "Instagram account"),
              String(me.username ?? ""),
              (me.profile_picture_url as string) ?? null,
              Number(me.followers_count ?? 0) || null,
              expiresAt,
              scopes,
              JSON.stringify({ flow: "instagram_login" }),
              nowIso(),
              nowIso(),
            ],
          );
        }
        run(
          `INSERT INTO oauth_tokens (id, connection_id, social_account_id, provider, access_token_enc, refresh_token_enc, token_type, expires_at, scopes, created_at, updated_at)
           VALUES (?,?,?,'meta',?,NULL,'bearer',?,?,?,?)`,
          [uid(), connectionId, accountId, encryptSecret(accessToken), expiresAt, scopes, nowIso(), nowIso()],
        );
        imported += 1;
      }
    }

    logAudit(ctx, "integration.meta_connected", "oauth_connection", connectionId, { flow, imported, scopes }, undefined);
    return redirect(`/integrations?meta=connected&accounts=${imported}`);
  } catch (err) {
    const message = err instanceof meta.MetaApiError ? `${err.payload.message} (code ${err.payload.code ?? "?"})` : err instanceof Error ? err.message : "unknown error";
    return redirect(`/integrations?meta=error&reason=${encodeURIComponent(message.slice(0, 300))}`);
  }
}
