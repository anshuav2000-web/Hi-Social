import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { ReportsClient } from "@/components/reports-client";
import { PageHeader } from "@/components/ui";

export default async function ReportsPage() {
  const ctx = await requirePermission("analytics.read");
  const reports = all<{
    id: string;
    name: string;
    kind: string;
    period_start: string;
    period_end: string;
    format: string;
    status: string;
    client_name: string | null;
    created_by_name: string | null;
    created_at: string;
  }>(
    `SELECT r.id, r.name, r.kind, r.period_start, r.period_end, r.format, r.status,
            c.name AS client_name, u.full_name AS created_by_name, r.created_at
       FROM reports r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN users u ON u.id = r.created_by
      WHERE r.workspace_id = ? ORDER BY r.created_at DESC LIMIT 60`,
    [ctx.workspace.id],
  );

  const schedules = all<{
    id: string;
    name: string;
    cadence: string;
    format: string;
    recipients: string | null;
    next_run_at: string | null;
    is_enabled: number;
  }>("SELECT * FROM report_schedules WHERE workspace_id = ? ORDER BY created_at DESC", [ctx.workspace.id]);

  const clients = all<{ id: string; name: string }>("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Reports & Exports"
        description="Period reports with KPIs, top content, recommendations and data provenance. Export to XLSX/CSV, print to PDF, and bulk manage content with validated imports."
      />
      <ReportsClient
        initialReports={reports}
        initialSchedules={schedules}
        clients={clients}
        canExport={hasPermission(ctx, "report.export")}
        emailConfigured={Boolean(process.env.SMTP_URL)}
      />
    </div>
  );
}
