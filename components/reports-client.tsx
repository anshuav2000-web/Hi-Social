"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Plus, Upload } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, SectionHeader, StatCard } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { formatDate, formatDateTime } from "@/lib/utils";

type Report = {
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
};

type Schedule = {
  id: string;
  name: string;
  cadence: string;
  format: string;
  recipients: string | null;
  next_run_at: string | null;
  is_enabled: number;
};

type ImportPreview = {
  dryRun: boolean;
  detectedRows: number;
  validRows: number;
  errors: { row: number; column: string; message: string }[];
  warnings: { row: number; column: string; message: string }[];
  plan: { row: number; title: string; platform: string; client: string | null; warnings: string[]; duplicate: boolean }[];
  message: string;
};

export function ReportsClient({
  initialReports,
  initialSchedules,
  clients,
  canExport,
  emailConfigured,
}: {
  initialReports: Report[];
  initialSchedules: Schedule[];
  clients: { id: string; name: string }[];
  canExport: boolean;
  emailConfigured: boolean;
}) {
  const toast = useToast();
  const [reports, setReports] = useState(initialReports);
  const [schedules] = useState(initialSchedules);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    kind: "monthly",
    clientId: "",
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    format: "pdf",
  });
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await api<{ rows: Report[] }>("/api/v1/reports");
    if (res.ok) setReports(res.data.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    const res = await api<{ id: string; name: string }>("/api/v1/reports", { method: "POST", json: draft });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    toast.success("Report generated", "Payload snapshot stored with the report.");
    setOpen(false);
    await load();
  };

  const upload = async (dryRun: boolean) => {
    if (!file) {
      toast.error("Choose a .xlsx or .csv file first");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("dryRun", String(dryRun));
    form.set("schedule", String(schedule));
    const res = await api<ImportPreview & { imported?: number; scheduled?: number; results?: { title: string; scheduled: boolean; note?: string }[] }>(
      "/api/v1/excel",
      { method: "POST", body: form },
    );
    setUploading(false);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).slice(0, 3).join(" · "));
      return;
    }
    if (dryRun) {
      setPreview(res.data);
      toast.info("Validated", res.data.message);
    } else {
      toast.success("Import complete", `${res.data.imported ?? 0} created · ${res.data.scheduled ?? 0} scheduled`);
      setPreview(null);
      setImportOpen(false);
      setFile(null);
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reports" value={String(reports.length)} hint="stored with snapshot payload" icon={<FileText size={14} />} />
        <StatCard label="Schedules" value={String(schedules.length)} hint={emailConfigured ? "email delivery configured" : "in-app only (no SMTP)"} icon={<FileSpreadsheet size={14} />} />
        <StatCard label="Clients covered" value={String(clients.length)} hint="client-scoped reporting" />
        <StatCard label="Bulk tools" value="XLSX · CSV" hint="template, import, export" icon={<Upload size={14} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader
            title="Reports"
            description="Generated from live database aggregates for the chosen period."
            actions={
              canExport ? (
                <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                  <Plus size={12} /> New report
                </button>
              ) : undefined
            }
          />
          <div className="mt-3 space-y-2">
            {reports.length === 0 && <EmptyState title="No reports yet" description="Generate a daily, weekly, monthly or client report." />}
            {reports.map((report) => (
              <div key={report.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">{report.name}</p>
                    <p className="text-[10.5px] text-[var(--muted)]">
                      {formatDate(report.period_start)} → {formatDate(report.period_end)} · {report.kind} ·{" "}
                      {report.client_name ?? "workspace-wide"} · {report.created_by_name ?? "system"}
                    </p>
                  </div>
                  <Badge status="published">{report.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a className="btn btn-sm" href={`/api/v1/reports/${report.id}/export?format=xlsx`}>
                    <Download size={11} /> XLSX
                  </a>
                  <a className="btn btn-sm" href={`/api/v1/reports/${report.id}/export?format=csv`}>
                    <Download size={11} /> CSV
                  </a>
                  <a className="btn btn-sm" href={`/api/v1/reports/${report.id}/export?format=html`} target="_blank" rel="noreferrer">
                    <FileText size={11} /> Print / PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            PDF is produced through the print-optimised HTML view (browser → Print → Save as PDF), so no binary PDF library is
            bundled. XLSX and CSV download directly.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Bulk Excel & CSV" description="Download the template, validate an import, then commit it." actions={
            <a className="btn btn-sm" href="/api/v1/excel?mode=template">
              <Download size={12} /> Template
            </a>
          } />
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <button className="btn btn-sm justify-start" onClick={() => setImportOpen(true)}>
              <Upload size={12} /> Import posts
            </button>
            <a className="btn btn-sm justify-start" href="/api/v1/excel?format=xlsx">
              <Download size={12} /> Export posts (XLSX)
            </a>
            <a className="btn btn-sm justify-start" href="/api/v1/excel?format=csv">
              <Download size={12} /> Export posts (CSV)
            </a>
            <a className="btn btn-sm justify-start" href="/docs">
              <FileText size={12} /> Column guide
            </a>
          </div>
          <div className="mt-3 space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 text-[11px] text-[var(--muted)]">
            <p>• 21 columns including Post ID, brief, creative link, approvals and publishing status.</p>
            <p>• Validation catches missing titles, unsupported platforms, bad dates/times, duplicates in-file and in-workspace.</p>
            <p>• Imports create <span className="text-[var(--fg)]">drafts</span>. Nothing is published by an import.</p>
            <p>• Scheduling on import is optional and blocked when the client requires approval.</p>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">Report schedules</p>
            {schedules.length === 0 && <p className="text-[11.5px] text-[var(--muted)]">No schedules configured.</p>}
            {schedules.map((item) => (
              <div key={item.id} className="mb-1.5 rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <span>{item.name}</span>
                  <Badge status={item.is_enabled ? "approved" : "draft"}>{item.cadence}</Badge>
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  next {formatDateTime(item.next_run_at)} · {item.format} · {item.recipients ?? "no recipients"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate report"
        description="The payload snapshot is stored so the report is reproducible."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : null} Generate
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Report type</label>
            <select className="select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {["daily", "weekly", "monthly", "quarterly", "client", "campaign", "team"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Client scope</label>
            <select className="select" value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}>
              <option value="">Entire workspace</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Primary format</label>
            <select className="select" value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })}>
              <option value="pdf">PDF (print view)</option>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import posts from XLSX or CSV"
        description="Validate first. Imports create drafts and never publish."
        size="lg"
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setImportOpen(false)}>Close</button>
            <button className="btn btn-sm" onClick={() => upload(true)} disabled={uploading || !file}>
              Validate
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => upload(false)} disabled={uploading || !file}>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Commit import
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="block w-full text-[12px] file:mr-2 file:rounded-lg file:border file:border-[var(--line)] file:bg-[var(--card-3)] file:px-2.5 file:py-1.5 file:text-[11.5px] file:text-[var(--fg)]"
          />
          <label className="flex items-center gap-2 text-[11.5px]">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="accent-[var(--brand)]" />
            Schedule rows that have a publish date (blocked when the client requires approval)
          </label>

          {preview && (
            <div className="space-y-2">
              <Banner tone={preview.errors.length > 0 ? "danger" : "success"} title={preview.message}>
                Detected {preview.detectedRows} rows · valid {preview.validRows} · errors {preview.errors.length} · warnings{" "}
                {preview.warnings.length}
              </Banner>
              {preview.errors.length > 0 && (
                <div className="max-h-[160px] overflow-y-auto rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                  {preview.errors.slice(0, 30).map((error, index) => (
                    <p key={index}>Row {error.row} · {error.column}: {error.message}</p>
                  ))}
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="max-h-[140px] overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  {preview.warnings.slice(0, 20).map((warning, index) => (
                    <p key={index}>Row {warning.row} · {warning.column}: {warning.message}</p>
                  ))}
                </div>
              )}
              <div className="max-h-[220px] overflow-y-auto rounded-lg border border-[var(--line)]">
                <table className="grid">
                  <thead><tr><th>Row</th><th>Title</th><th>Platform</th><th>Client</th><th>Notes</th></tr></thead>
                  <tbody>
                    {preview.plan.slice(0, 50).map((row) => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.title}</td>
                        <td>{row.platform}</td>
                        <td>{row.client ?? "—"}</td>
                        <td className="text-[10.5px] text-[var(--muted)]">{row.warnings.join(" · ") || "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
