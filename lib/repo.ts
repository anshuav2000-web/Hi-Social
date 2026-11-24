import "server-only";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth";
import { scopedClientIds } from "@/lib/api-guard";
import type { ResourceDef } from "@/lib/modules";

const columnCache = new Map<string, Set<string>>();

export function tableColumns(table: string): Set<string> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (rows.length === 0) throw new ApiError(`Unknown table ${table}`, 400, "unknown_table");
  const set = new Set(rows.map((r) => r.name));
  columnCache.set(table, set);
  return set;
}

function coerce(resource: ResourceDef, input: Record<string, unknown>) {
  const cols = tableColumns(resource.table);
  const out: Record<string, unknown> = {};
  for (const field of resource.fields) {
    if (!(field.name in input)) continue;
    if (!cols.has(field.name)) continue;
    let value = input[field.name];
    if (value === "" || value === undefined) value = null;
    if (field.type === "boolean" && value !== null) value = value ? 1 : 0;
    if (field.type === "number" && value !== null) value = Number(value);
    out[field.name] = value;
  }
  return out;
}

export type ListResult = { rows: Record<string, unknown>[]; total: number; page: number; pageSize: number };

export function listResource(
  ctx: AuthContext,
  resource: ResourceDef,
  url: URL,
  extra: { clientScopedColumn?: string } = {},
): ListResult {
  const cols = tableColumns(resource.table);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || 25) || 25));
  const where: string[] = [];
  const params: unknown[] = [];

  if (cols.has("workspace_id")) {
    where.push("workspace_id = ?");
    params.push(ctx.workspace.id);
  }
  if (cols.has("deleted_at")) where.push("deleted_at IS NULL");

  const scoped = scopedClientIds(ctx);
  const scopeColumn = extra.clientScopedColumn ?? "client_id";
  if (scoped !== null && cols.has(scopeColumn)) {
    if (scoped.length === 0) {
      where.push("1 = 0");
    } else {
      where.push(`${scopeColumn} IN (${scoped.map(() => "?").join(",")})`);
      params.push(...scoped);
    }
  }

  const search = (url.searchParams.get("q") || "").trim();
  if (search) {
    const like = `%${search.replace(/[%_]/g, "")}%`;
    where.push(`(${resource.searchColumns.map((c) => `${c} LIKE ?`).join(" OR ")})`);
    for (const _ of resource.searchColumns) params.push(like);
  }

  for (const filter of resource.filters ?? []) {
    const value = url.searchParams.get(filter.name);
    if (value) {
      where.push(`${filter.column} = ?`);
      params.push(value);
    }
  }
  for (const key of ["client_id", "campaign_id", "status", "platform", "assignee_id", "post_id", "competitor_id", "kind"]) {
    const value = url.searchParams.get(key);
    if (value && cols.has(key) && !(resource.filters ?? []).some((f) => f.name === key)) {
      where.push(`${key} = ?`);
      params.push(value);
    }
  }

  const sortParam = url.searchParams.get("sort") || resource.defaultSort;
  const sort = cols.has(sortParam) ? sortParam : resource.defaultSort;
  const dir = (url.searchParams.get("dir") || resource.order).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${resource.table} ${whereSql}`, params);
  const rows = all(
    `SELECT * FROM ${resource.table} ${whereSql} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { rows, total: totalRow?.n ?? 0, page, pageSize };
}

export function getResourceRow(ctx: AuthContext, resource: ResourceDef, id: string) {
  const cols = tableColumns(resource.table);
  const row = cols.has("workspace_id")
    ? get<Record<string, unknown>>(`SELECT * FROM ${resource.table} WHERE id = ? AND workspace_id = ?`, [id, ctx.workspace.id])
    : get<Record<string, unknown>>(`SELECT * FROM ${resource.table} WHERE id = ?`, [id]);
  if (!row) throw new ApiError(`${resource.singular} not found`, 404, "not_found");
  const scoped = scopedClientIds(ctx);
  if (scoped !== null && row.client_id && !scoped.includes(String(row.client_id))) {
    throw new ApiError(`${resource.singular} not found`, 404, "not_found");
  }
  return row;
}

export function createResource(ctx: AuthContext, resource: ResourceDef, input: Record<string, unknown>, ip?: string) {
  const cols = tableColumns(resource.table);
  const values = coerce(resource, input);
  if (cols.has("id")) values.id = uid();
  if (cols.has("workspace_id")) values.workspace_id = ctx.workspace.id;
  if (cols.has("created_at")) values.created_at = nowIso();
  if (cols.has("updated_at")) values.updated_at = nowIso();
  if (cols.has("created_by") && !values.created_by) values.created_by = ctx.user.id;
  if (cols.has("saved_at")) values.saved_at = nowIso();
  if (cols.has("size_bytes") && values.size_bytes === undefined) values.size_bytes = 0;

  const keys = Object.keys(values);
  if (keys.length === 0) throw new ApiError("No valid fields supplied", 422, "empty_payload");
  try {
    run(
      `INSERT INTO ${resource.table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      keys.map((k) => values[k]),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new ApiError("A record with those values already exists", 409, "duplicate");
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      throw new ApiError("Related record not found in this workspace", 422, "invalid_reference");
    }
    if (/NOT NULL constraint failed/i.test(message)) {
      throw new ApiError(`Missing required field: ${message.split(".").pop()?.trim()}`, 422, "not_null");
    }
    throw err;
  }
  const id = String(values.id);
  logAudit(ctx, `${resource.key}.created`, resource.singular.toLowerCase(), id, values, ip);
  return getResourceRow(ctx, resource, id);
}

export function updateResource(
  ctx: AuthContext,
  resource: ResourceDef,
  id: string,
  input: Record<string, unknown>,
  ip?: string,
) {
  const existing = getResourceRow(ctx, resource, id);
  const cols = tableColumns(resource.table);
  const values = coerce(resource, input);
  if (cols.has("updated_at")) values.updated_at = nowIso();
  const keys = Object.keys(values);
  if (keys.length === 0) throw new ApiError("No valid fields supplied", 422, "empty_payload");
  try {
    run(
      `UPDATE ${resource.table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      [...keys.map((k) => values[k]), id],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/UNIQUE constraint failed/i.test(message)) throw new ApiError("Duplicate value", 409, "duplicate");
    if (/FOREIGN KEY constraint failed/i.test(message)) throw new ApiError("Invalid reference", 422, "invalid_reference");
    throw err;
  }
  logAudit(ctx, `${resource.key}.updated`, resource.singular.toLowerCase(), id, { changes: values }, ip);
  return { ...existing, ...values, id };
}

export function deleteResource(ctx: AuthContext, resource: ResourceDef, id: string, ip?: string) {
  getResourceRow(ctx, resource, id);
  const cols = tableColumns(resource.table);
  if (cols.has("deleted_at")) {
    run(`UPDATE ${resource.table} SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  } else {
    run(`DELETE FROM ${resource.table} WHERE id = ?`, [id]);
  }
  logAudit(ctx, `${resource.key}.deleted`, resource.singular.toLowerCase(), id, {}, ip);
  return { id };
}
