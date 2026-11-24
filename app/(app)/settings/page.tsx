import { get } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { aiStatus } from "@/lib/ai";
import { describeMetaConfig } from "@/lib/meta";
import { SettingsClient } from "@/components/settings-client";
import { PageHeader } from "@/components/ui";
import path from "node:path";

export default async function SettingsPage() {
  const ctx = await requirePermission("workspace.read");
  const workspace = get<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    logo_color: string;
    plan: string;
    is_demo: number;
    settings_json: string;
  }>("SELECT id, name, slug, timezone, logo_color, plan, is_demo, settings_json FROM workspaces WHERE id = ?", [ctx.workspace.id]);

  const counts = {
    clients: get<{ n: number }>("SELECT COUNT(*) AS n FROM clients WHERE workspace_id = ?", [ctx.workspace.id])?.n ?? 0,
    members: get<{ n: number }>("SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND status = 'active'", [ctx.workspace.id])?.n ?? 0,
    posts: get<{ n: number }>("SELECT COUNT(*) AS n FROM social_posts WHERE workspace_id = ?", [ctx.workspace.id])?.n ?? 0,
    assets: get<{ n: number }>("SELECT COUNT(*) AS n FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL", [ctx.workspace.id])?.n ?? 0,
  };
  const storageBytes =
    get<{ total: number | null }>("SELECT SUM(size_bytes) AS total FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL", [
      ctx.workspace.id,
    ])?.total ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Workspace configuration, account details, integration readiness, AI providers, storage and notification channels."
      />
      <SettingsClient
        workspace={workspace ?? {
          id: ctx.workspace.id,
          name: ctx.workspace.name,
          slug: ctx.workspace.slug,
          timezone: "UTC",
          logo_color: "#1677FF",
          plan: "agency",
          is_demo: ctx.workspace.is_demo,
          settings_json: "{}",
        }}
        counts={counts}
        storageBytes={storageBytes}
        storageDir={env.storageDir || path.join(process.cwd(), "storage", "uploads")}
        meta={describeMetaConfig()}
        ai={await aiStatus()}
        email={{ configured: Boolean(env.smtpUrl), from: env.smtpFrom }}
        canManage={ctx.workspace.role_key === "workspace_admin" || ctx.user.is_super_admin === 1}
        account={{
          name: ctx.user.full_name,
          email: ctx.user.email,
          role: ctx.workspace.role_label,
          timezone: ctx.user.timezone,
        }}
      />
    </div>
  );
}
