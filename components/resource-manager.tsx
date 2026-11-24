"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2, Pencil, MoreVertical, Upload } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { RESOURCE_MAP, type Field } from "@/lib/modules";
import { Card, EmptyState } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { formatDate, label } from "@/lib/utils";

export type Lookups = {
  clients: { id: string; name: string }[];
  users: { id: string; full_name: string }[];
  campaigns: { id: string; name: string }[];
  posts: { id: string; title: string }[];
};

type Row = Record<string, unknown>;

function FieldInput({
  field,
  value,
  onChange,
  lookups,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  lookups: Lookups;
}) {
  const common = { className: "input", id: `field-${field.name}` };
  if (field.type === "textarea") {
    return <textarea {...common} className="textarea" rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
  }
  if (field.type === "select") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "client") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {lookups.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "user") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— unassigned —</option>
        {lookups.users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.full_name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "campaign") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {lookups.campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "post") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {lookups.posts.map((post) => (
          <option key={post.id} value={post.id}>
            {post.title}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand)]" />
        Enabled
      </label>
    );
  }
  if (field.type === "datetime") {
    const current = value ? new Date(String(value)).toISOString().slice(0, 16) : "";
    return <input type="datetime-local" {...common} value={current} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
  }
  if (field.type === "date") {
    return <input type="date" {...common} value={String(value ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />;
  }
  if (field.type === "color") {
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={String(value ?? "#1677FF")} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-[var(--line)] bg-transparent" />
        <input {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <input
      {...common}
      type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
      value={String(value ?? "")}
      onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
      placeholder={field.placeholder}
    />
  );
}

function RowMenu({
  canWrite,
  onEdit,
  onImport,
  onRemove,
}: {
  canWrite: boolean;
  onEdit: () => void;
  onImport: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!canWrite) return null;

  const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--card-2)]";

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="btn btn-ghost btn-sm btn-icon" aria-label="Row actions" onClick={() => setOpen((v) => !v)}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--card)] py-1 shadow-lg">
          <button className={item} onClick={() => { setOpen(false); onEdit(); }}>
            <Pencil size={12} /> Edit
          </button>
          <button className={item} onClick={() => { setOpen(false); onImport(); }}>
            <Upload size={12} /> Import
          </button>
          <button className={`${item} text-rose-300`} onClick={() => { setOpen(false); onRemove(); }}>
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

export function ResourceManager({
  resourceKey,
  lookups,
  canWrite,
  title,
  description,
  fixedFilters,
  extraColumns = [],
  onChanged,
}: {
  resourceKey: string;
  lookups: Lookups;
  canWrite: boolean;
  title?: string;
  description?: string;
  fixedFilters?: Record<string, string>;
  extraColumns?: Column<Row>[];
  onChanged?: () => void;
}) {
  const resource = RESOURCE_MAP[resourceKey]!;
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    rejected: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("q", search.trim());
    for (const [key, value] of Object.entries({ ...filters, ...fixedFilters })) {
      if (value) query.set(key, value);
    }
    const res = await api<{ rows: Row[]; total: number }>(`/api/v1/data/${resourceKey}?${query.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRows(res.data.rows);
    setTotal(res.data.total);
  }, [resourceKey, page, search, filters, fixedFilters]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 220 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const blank = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const field of resource.fields) {
      if (field.defaultValue !== undefined) values[field.name] = field.defaultValue;
    }
    for (const [key, value] of Object.entries(fixedFilters ?? {})) values[key] = value;
    return values;
  }, [resource, fixedFilters]);

  const openCreate = () => {
    setForm(blank);
    setIssues([]);
    setCreating(true);
    setEditing(null);
  };

  const openEdit = (row: Row) => {
    setForm({ ...row });
    setIssues([]);
    setEditing(row);
    setCreating(false);
  };

  const save = async () => {
    setSaving(true);
    setIssues([]);
    const payload: Record<string, unknown> = {};
    for (const field of resource.fields) {
      const value = form[field.name];
      if (value === undefined || value === "") {
        if (field.required) payload[field.name] = "";
        continue;
      }
      payload[field.name] = value;
    }
    const res = editing
      ? await api(`/api/v1/data/${resourceKey}/${String(editing.id)}`, { method: "PATCH", json: payload })
      : await api(`/api/v1/data/${resourceKey}`, { method: "POST", json: payload });
    setSaving(false);
    if (!res.ok) {
      setIssues([res.error, ...errorList(res.details)]);
      toast.error(res.error);
      return;
    }
    toast.success(editing ? `${resource.singular} updated` : `${resource.singular} created`);
    setCreating(false);
    setEditing(null);
    await load();
    onChanged?.();
  };

  const remove = async (row: Row) => {
    if (!window.confirm(`Delete this ${resource.singular.toLowerCase()}?`)) return;
    const res = await api(`/api/v1/data/${resourceKey}/${String(row.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${resource.singular} deleted`);
    await load();
    onChanged?.();
  };

  const runImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", importFile);
    try {
      const res = await fetch(`/api/v1/data/${resourceKey}/import`, { method: "POST", body: form });
      const text = await res.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!res.ok) {
        toast.error(parsed?.error?.message ?? `Import failed (${res.status})`);
        return;
      }
      const d = parsed?.data ?? parsed;
      setImportResult(d);
      toast.success(`Imported ${d.imported} ${resource.label.toLowerCase()}${d.rejected ? `, ${d.rejected} rejected` : ""}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  const columns: Column<Row>[] = [
    ...resource.fields
      .filter((field) => !field.hideInTable)
      .map((field) => ({
        key: field.name,
        header: field.label,
        width: field.width,
        sortable: true,
        render: (row: Row) => {
          const value = row[field.name];
          if (value === null || value === undefined || value === "") return <span className="text-[var(--muted)]">—</span>;
          if (field.type === "client") return lookups.clients.find((c) => c.id === value)?.name ?? "—";
          if (field.type === "user") return lookups.users.find((u) => u.id === value)?.full_name ?? "—";
          if (field.type === "post") return lookups.posts.find((p) => p.id === value)?.title ?? "—";
          if (field.type === "boolean") return value ? "Yes" : "No";
          if (field.type === "datetime") return formatDate(String(value));
          if (field.type === "date") return formatDate(String(value));
          if (field.type === "select") return <span className="badge">{label(String(value))}</span>;
          if (field.type === "textarea") return <span className="line-clamp-1 max-w-[320px] text-[var(--muted)]">{String(value)}</span>;
          if (field.name === "color") return <span className="inline-block h-3 w-3 rounded-full" style={{ background: String(value) }} />;
          return <span className="truncate">{String(value)}</span>;
        },
      })),
    ...extraColumns,
  ];

  if (canWrite) {
    columns.push({
      key: "__actions",
      header: "",
      width: "64px",
      align: "right",
      render: (row: Row) => (
        <div className="flex items-center justify-end">
          <RowMenu
            canWrite={canWrite}
            onEdit={() => openEdit(row)}
            onImport={() => {
              setImportFile(null);
              setImportResult(null);
              setImporting(true);
            }}
            onRemove={() => remove(row)}
          />
        </div>
      ),
    });
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--line)]">
        <div>
          <p className="text-[13.5px] font-semibold">{title ?? resource.label}</p>
          <p className="text-[11.5px] text-[var(--muted)]">{description ?? resource.description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
          </button>
          {canWrite && (
            <button className="btn btn-sm" onClick={() => { setImportFile(null); setImportResult(null); setImporting(true); }}>
              <Upload size={13} /> Import
            </button>
          )}
          {canWrite && (
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={13} /> New {resource.singular.toLowerCase()}
            </button>
          )}
        </div>
      </div>

      {(resource.filters?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--line)]">
          {resource.filters?.map((filter) => (
            <select
              key={filter.name}
              className="select h-8 w-auto min-w-[140px] text-[11.5px]"
              value={filters[filter.name] ?? ""}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({ ...prev, [filter.name]: e.target.value }));
              }}
            >
              <option value="">All {filter.label.toLowerCase()}</option>
              {(filter.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {error && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-200">
          {error} — <button className="underline" onClick={load}>retry</button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        searchValue={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        searchPlaceholder={`Search ${resource.label.toLowerCase()}…`}
        onRowClick={canWrite ? openEdit : undefined}
        rowId={(row) => String(row.id)}
        empty={
          <EmptyState
            title={`No ${resource.label.toLowerCase()} yet`}
            description={canWrite ? resource.description : "Nothing has been created for this workspace yet."}
            action={canWrite ? <button className="btn btn-primary" onClick={openCreate}>Create {resource.singular.toLowerCase()}</button> : undefined}
          />
        }
      />

      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2 text-[11.5px] text-[var(--muted)]">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button className="btn btn-sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${resource.singular.toLowerCase()}` : `New ${resource.singular.toLowerCase()}`}
        description={editing ? `ID ${String(editing.id)}` : resource.description}
        size="lg"
        footer={
          <>
            <button className="btn btn-sm" onClick={() => { setCreating(false); setEditing(null); }}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : `Create ${resource.singular.toLowerCase()}`}
            </button>
          </>
        }
      >
        {issues.length > 0 && (
          <div className="mb-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            <ul className="list-inside list-disc space-y-0.5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {resource.fields
            .filter((field) => !field.hideInForm)
            .map((field) => (
              <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
                <label className="label" htmlFor={`field-${field.name}`}>
                  {field.label} {field.required && <span className="text-rose-400">*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={form[field.name]}
                  onChange={(value) => setForm((prev) => ({ ...prev, [field.name]: value }))}
                  lookups={lookups}
                />
                {field.help && <p className="mt-1 text-[10.5px] text-[var(--muted)]">{field.help}</p>}
              </div>
            ))}
        </div>
      </Modal>

      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title={`Import ${resource.label.toLowerCase()}`}
        description="Upload a .xlsx, .csv or .docx file"
        size="md"
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setImporting(false)}>Close</button>
            <button className="btn btn-primary btn-sm" onClick={runImport} disabled={importBusy || !importFile}>
              {importBusy ? "Importing…" : "Import file"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            Spreadsheets are matched by column heading to the fields above. A Word document becomes one{" "}
            {resource.singular.toLowerCase()} per paragraph — a line ending in “:” sets the category for the lines
            below it.
          </p>
          <input
            type="file"
            accept=".xlsx,.csv,.docx"
            className="input"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          {importResult && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-3 text-[12px]">
              <p className="font-medium">
                Imported {importResult.imported}
                {importResult.rejected ? ` · rejected ${importResult.rejected}` : ""}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-rose-300">
                  {importResult.errors.slice(0, 8).map((e) => (
                    <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
