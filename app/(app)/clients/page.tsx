import Link from "next/link";
import { all } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { ResourceManager } from "@/components/resource-manager";
import { BrandVoiceEditor } from "@/components/brand-voice-editor";
import { Badge, Card, EmptyState, PageHeader, PlatformDot, SectionHeader, Avatar } from "@/components/ui";
import { label } from "@/lib/utils";

export default async function ClientsPage() {
  const ctx = await requirePermission("client.read");
  const lookups = workspaceLookups(ctx.workspace.id);

  const accounts = all<{
    id: string;
    name: string;
    client_id: string | null;
    client_name: string | null;
    platform: string;
    account_type: string;
    status: string;
    followers_count: number | null;
    external_id: string;
  }>(
    `SELECT sa.id, sa.name, sa.client_id, c.name AS client_name, sa.platform, sa.account_type, sa.status, sa.followers_count, sa.external_id
       FROM social_accounts sa LEFT JOIN clients c ON c.id = sa.client_id
      WHERE sa.workspace_id = ? ORDER BY c.name, sa.platform`,
    [ctx.workspace.id],
  );

  const brandProfiles = all<{ client_id: string; tone: string | null }>(
    "SELECT client_id, tone FROM brand_profiles WHERE workspace_id = ?",
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Brands & team"
        title="Brand Management"
        description="Brand-wise operations: guidelines, approval rules, connected accounts and team assignment. Every row is scoped to this workspace."
      />

      <ResourceManager resourceKey="clients" lookups={lookups} canWrite={hasPermission(ctx, "client.manage")} />

      <div className="grid gap-4 xl:grid-cols-2">
        <BrandVoiceEditor clients={lookups.clients} canWrite={hasPermission(ctx, "client.manage")} />

        <Card>
          <SectionHeader
            title="Brand social accounts"
            description="Accounts are connected once in Integrations, then assigned to a brand."
            actions={<Link href="/integrations" className="text-[11px] text-[var(--accent)]">Integrations</Link>}
          />
          {accounts.length === 0 ? (
            <EmptyState title="No connected accounts" description="Connect Instagram or Facebook from the Integration Center." />
          ) : (
            <div className="mt-3 space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">{account.name}</p>
                    <p className="text-[10.5px] text-[var(--muted)]">
                      {account.client_name ?? "Unassigned brand"} · {account.account_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlatformDot platform={account.platform} />
                    <Badge status={account.status === "connected" ? "published" : "draft"}>
                      {account.status === "connected" ? "Live" : label(account.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
            <p className="text-[11px] font-medium">Brand voice coverage</p>
            <div className="mt-1.5 space-y-1">
              {lookups.clients.map((client) => {
                const profile = brandProfiles.find((p) => p.client_id === client.id);
                return (
                  <div key={client.id} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <Avatar name={client.name} size={16} /> {client.name}
                    </span>
                    <span className={profile ? "text-emerald-400" : "text-[var(--muted)]"}>
                      {profile ? profile.tone || "profile saved" : "no profile yet"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
