import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ensureScheduler } from "@/lib/scheduler";

/**
 * Thin wrapper around Node's built-in SQLite. We resolve the builtin through
 * process.getBuiltinModule so bundlers never try to trace node:sqlite.
 */
type AnyDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
};

const g = globalThis as unknown as {
  __shpDb?: AnyDb;
  __shpBootstrapped?: boolean;
  __shpBootstrapPromise?: Promise<void>;
};

export function dbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  return path.join(process.cwd(), "data", "socialhub.db");
}

export function getDb(): AnyDb {
  if (g.__shpDb) return g.__shpDb;
  const mod = (
    process as unknown as { getBuiltinModule: (name: string) => Record<string, unknown> }
  ).getBuiltinModule("node:sqlite") as { DatabaseSync: new (p: string) => AnyDb };
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new mod.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  g.__shpDb = db;
  return db;
}

function readSql(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

export async function ensureBootstrapped(): Promise<void> {
  if (g.__shpBootstrapped) return;
  if (g.__shpBootstrapPromise) return g.__shpBootstrapPromise;
  g.__shpBootstrapPromise = (async () => {
    const db = getDb();
    db.exec(readSql("db/schema.sql"));
    db.exec(readSql("db/seed-rbac.sql"));
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT (version) DO NOTHING",
    ).run("001_init", now);
    const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    if (Number(count.n) === 0 && process.env.SEED_DEMO !== "false") {
      const seed = await import("@/db/seed.mjs");
      seed.seedDemo(db, { now });
    }
    ensureScheduler();
    g.__shpBootstrapped = true;
  })();
  return g.__shpBootstrapPromise;
}

// ── Query helpers ────────────────────────────────────────────
// node:sqlite returns rows with a null prototype, which React refuses to
// serialise across the server → client boundary. Every row is copied into a
// plain object here so callers never have to think about it.
function plain<T>(row: Record<string, unknown>): T {
  return { ...row } as T;
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const rows = getDb()
    .prepare(sql)
    .all(...params) as unknown as Record<string, unknown>[];
  return rows.map((row) => plain<T>(row));
}

export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const row = getDb()
    .prepare(sql)
    .get(...params) as unknown as Record<string, unknown> | undefined;
  return row ? plain<T>(row) : null;
}

export function run(sql: string, params: unknown[] = []): { changes: number; lastId: number } {
  const res = getDb()
    .prepare(sql)
    .run(...params);
  return { changes: res.changes, lastId: Number(res.lastInsertRowid) };
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
