#!/usr/bin/env node
/**
 * Standalone publishing worker for Docker / Coolify deployments.
 * Polls the app's tick endpoint with the shared WORKER_SECRET.
 *
 *   WORKER_SECRET=... APP_ORIGIN=https://app.example.com node scripts/worker.mjs
 */
const origin = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.WORKER_SECRET || "";
const intervalMs = Math.max(5000, Number(process.env.SCHEDULER_INTERVAL_SECONDS || 20) * 1000);

if (!secret) {
  console.warn("[worker] WORKER_SECRET is not set — the tick endpoint will reject this worker.");
}

let running = false;
let failures = 0;

async function tick() {
  if (running) return;
  running = true;
  try {
    const res = await fetch(`${origin}/api/v1/scheduler/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) {
      failures += 1;
      console.error(`[worker] tick HTTP ${res.status}: ${body.slice(0, 300)}`);
    } else {
      failures = 0;
      const parsed = JSON.parse(body);
      const data = parsed.data ?? {};
      if (data.processed) console.log(`[worker] processed=${data.processed} ok=${data.succeeded} failed=${data.failed}`);
    }
  } catch (err) {
    failures += 1;
    console.error(`[worker] tick error: ${err instanceof Error ? err.message : err}`);
  } finally {
    running = false;
  }
}

console.log(`[worker] polling ${origin} every ${intervalMs / 1000}s`);
setInterval(tick, intervalMs);
tick();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received, exiting (failures=${failures})`);
    process.exit(0);
  });
}
