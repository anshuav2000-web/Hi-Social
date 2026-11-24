/**
 * In-process publishing scheduler.
 *
 * Started lazily the first time the server touches the database, so a scheduled
 * post publishes without any browser tab being open. Set
 * ENABLE_INPROCESS_SCHEDULER=false when a dedicated worker container drives
 * /api/v1/scheduler/tick instead (see docker-compose.yml).
 *
 * Kept out of instrumentation.ts on purpose: Next compiles instrumentation for
 * the edge runtime too, where `node:crypto` (used for token decryption) is not
 * available.
 */
type SchedulerGlobal = { __shpScheduler?: ReturnType<typeof setInterval> };

export function ensureScheduler(): void {
  if (typeof window !== "undefined") return;
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.ENABLE_INPROCESS_SCHEDULER === "false") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build") return;

  const g = globalThis as unknown as SchedulerGlobal;
  if (g.__shpScheduler) return;

  const intervalSeconds = Math.max(5, Number(process.env.SCHEDULER_INTERVAL_SECONDS || 20));

  const tick = async () => {
    try {
      const { runPublishingTick } = await import("@/lib/publishing");
      const result = await runPublishingTick();
      if (result.processed > 0) {
        console.log(`[scheduler] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed}`);
      }
    } catch (err) {
      console.error("[scheduler] tick failed", err instanceof Error ? err.message : err);
    }
  };

  const timer = setInterval(() => void tick(), intervalSeconds * 1000);
  if (typeof timer === "object" && timer && "unref" in timer) (timer as NodeJS.Timeout).unref();
  g.__shpScheduler = timer;

  const initial = setTimeout(() => void tick(), 4000);
  if (typeof initial === "object" && initial && "unref" in initial) (initial as NodeJS.Timeout).unref();

  console.log(`[scheduler] started (every ${intervalSeconds}s)`);
}
