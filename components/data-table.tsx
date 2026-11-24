"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "right" | "center";
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading,
  empty,
  searchValue,
  onSearch,
  searchPlaceholder = "Search…",
  sortKey,
  sortDir,
  onSort,
  toolbar,
  onRowClick,
  activeRowId,
  rowId,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: ReactNode;
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  sortKey?: string;
  sortDir?: "ASC" | "DESC";
  onSort?: (key: string) => void;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  activeRowId?: string | null;
  rowId?: (row: T) => string;
}) {
  return (
    <div>
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
          {onSearch && (
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                className="input h-8 pl-8 text-[12px]"
                value={searchValue ?? ""}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width, textAlign: column.align ?? "left" }}
                  className={column.sortable ? "cursor-pointer select-none" : undefined}
                  onClick={() => column.sortable && onSort?.(column.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    {column.sortable &&
                      (sortKey === column.key ? (
                        sortDir === "ASC" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      ) : (
                        <ChevronsUpDown size={10} className="opacity-40" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <div className="skeleton h-3.5 w-[70%]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows.map((row, index) => {
                const id = rowId ? rowId(row) : String(row.id ?? index);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    className={cn(onRowClick && "cursor-pointer", activeRowId === id && "bg-[var(--brand-soft)]")}
                  >
                    {columns.map((column) => (
                      <td key={column.key} style={{ textAlign: column.align ?? "left" }}>
                        {column.render ? column.render(row) : String(row[column.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && <div className="py-10">{empty}</div>}
    </div>
  );
}
