import { all } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { describeMetaConfig, PERMISSION_SETS } from "@/lib/meta";
import { IntegrationsClient } from "@/components/integrations-client";
import { Banner, PageHeader } from "@/components/ui";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("integration.manage");
  const params = await searchParams;

  const accounts = all<{
    id: string;
    name: string;
    platform: string;
    account_type: string;
    external_id: string;
    status: string;
    client_id: string | null;
    scopes: string | null;
    token_expires_at: string | null;
    token_count: number;
    followers_count: number | null;
    last_synced_at: string | null;
    connected_at: string;
  }>(
    `SELECT sa.id, sa.name, sa.platform, sa.account_type, sa.external_id, sa.status, sa.client_id, sa.scopes,
            (SELECT expires_at FROM oauth_tokens t WHERE t.social_account_id = sa.id ORDER BY created_at DESC LIMIT 1) AS token_expires_at,
            (SELECT COUNT(*) FROM oauth_tokens t WHERE t.social_account_id = sa.id) AS token_count,
            sa.followers_count, sa.last_synced_at, sa.connected_at
       FROM social_accounts sa WHERE sa.workspace_id = ? ORDER BY sa.platform, sa.name`,
    [ctx.workspace.id],
  );

  const syncs = all<{
    id: string;
    account_name: string | null;
    kind: string;
    status: string;
    progress: number;
    records: number;
    error: string | null;
    created_at: string;
    finished_at: string | null;
  }>(
    `SELECT sj.id, sa.name AS account_name, sj.kind, sj.status, sj.progress, sj.records, sj.error, sj.created_at, sj.finished_at
       FROM sync_jobs sj LEFT JOIN social_accounts sa ON sa.id = sj.social_account_id
      WHERE sj.workspace_id = ? ORDER BY sj.created_at DESC LIMIT 25`,
    [ctx.workspace.id],
  );

  const webhooks = all<{ id: string; event: string; status: string; signature_valid: number; created_at: string; error: string | null }>(
    `SELECT id, event, status, signature_valid, created_at, error FROM integration_webhooks
      WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY created_at DESC LIMIT 20`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Integration Center"
        description="Connect Meta, inspect permissions, monitor tokens, run historical syncs and read webhook deliveries. Only official APIs are used."
      />
      {params.meta === "connected" && (
        <Banner tone="success" title="Meta connected">
          {params.accounts ?? 0} account(s) imported. Run a history sync to pull the last 90 days of insights.
        </Banner>
      )}
      {params.meta === "error" && (
        <Banner tone="danger" title="Meta connection failed">
          {decodeURIComponent(params.reason ?? "unknown error")}
        </Banner>
      )}
      <IntegrationsClient
        config={describeMetaConfig()}
        accounts={accounts}
        syncs={syncs}
        webhooks={webhooks}
        permissionSets={PERMISSION_SETS}
        canManage
      />
    </div>
  );
}
