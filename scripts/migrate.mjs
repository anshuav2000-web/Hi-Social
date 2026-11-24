#!/usr/bin/env node
/**
 * Database bootstrap CLI: node scripts/migrate.mjs [--reset] [--no-seed]
 * Creates data/socialhub.db, applies db/schema.sql, RBAC seed and (optionally)
 * the demo dataset.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const reset = process.argv.includes("--reset");
const noSeed = process.argv.includes("--no-seed");
const dbFile = process.env.DATABASE_PATH || path.join(root, "data", "socialhub.db");

if (reset && fs.existsSync(dbFile)) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = dbFile + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  console.log(`Removed ${dbFile}`);
}

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
db.exec(fs.readFileSync(path.join(root, "db", "seed-rbac.sql"), "utf8"));
db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?,?) ON CONFLICT (version) DO NOTHING").run(
  "001_init",
  new Date().toISOString(),
);

const users = db.prepare("SELECT COUNT(*) AS n FROM users").get();
if (users.n === 0 && !noSeed) {
  const { seedDemo } = await import(pathToFileURL(path.join(root, "db", "seed.mjs")).href);
  const result = seedDemo(db, {});
  console.log(`Seeded demo workspace ${result.workspaceId}. Sign in with admin@socialhubpro.app / ${result.password}`);
} else {
  console.log(`Database ready (${users.n} existing users).`);
}
console.log(`Migrations applied → ${dbFile}`);
db.close();
