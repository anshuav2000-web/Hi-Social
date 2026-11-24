import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { ACTIONS, TRIGGERS } from "@/lib/automations";
import { AutomationsClient } from "@/components/automations-client";
import { PageHeader } from "@/components/ui";

export default async function AutomationsPage() {
  const ctx = await requirePermission("automation.manage");
  const automations = all<{
    id: string;
    name: string;
    trigger_key: string;
    conditions_json: string;
    actions_json: string;
    is_enabled: number;
    last_run_at: string | null;
    run_count: number;
  }>("SELECT * FROM automations WHERE workspace_id = ? ORDER BY created_at DESC", [ctx.workspace.id]);

  const runs = all<{
    id: string;
    automation_name: string;
    trigger_event: string;
    status: string;
    log: string | null;
    duration_ms: number | null;
    created_at: string;
  }>(
    `SELECT ar.id, a.name AS automation_name, ar.trigger_event, ar.status, ar.log, ar.duration_ms, ar.created_at
       FROM automation_runs ar JOIN automations a ON a.id = ar.automation_id
      WHERE ar.workspace_id = ? ORDER BY ar.created_at DESC LIMIT 40`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Brands & team"
        title="Workflow Automation"
        description="Rule-based automation with triggers, conditions, actions, run history and loop prevention. Rules execute inside the app, not in a third-party service."
      />
      <AutomationsClient
        initialAutomations={automations}
        initialRuns={runs}
        triggers={TRIGGERS}
        actions={ACTIONS}
        canManage={hasPermission(ctx, "automation.manage")}
      />
    </div>
  );
}
