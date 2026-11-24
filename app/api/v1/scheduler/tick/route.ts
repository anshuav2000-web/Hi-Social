import { all, get } from "@/lib/db";
import { fail, handleApiError, ok } from "@/lib/http";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { runPublishingTick } from "@/lib/publishing";
import { getAuthContext } from "@/lib/auth";

/**
 * Machine-to-machine publishing tick.
 * - Worker service authenticates with `Authorization: Bearer $WORKER_SECRET`.
 * - Signed-in operators can trigger a tick from the Publishing Queue UI.
 */
async function authorize(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (env.workerSecret && token && safeEqual(token, env.workerSecret)) return true;
  const ctx = await getAuthContext();
  return Boolean(ctx);
}

export async function GET(req: Request) {
  try {
    if (!(await authorize(req))) return fail("Unauthorized", 401, "unauthenticated");
    const due = get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM publishing_jobs WHERE status = 'queued' AND run_at <= ?",
      [new Date().toISOString()],
    );
    return ok({
      due: due?.n ?? 0,
      scheduler: env.inprocessScheduler ? "in-process + worker" : "worker",
      intervalSeconds: env.schedulerIntervalSeconds,
      workspaces: all<{ id: string }>("SELECT id FROM workspaces").length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    if (!(await authorize(req))) return fail("Unauthorized", 401, "unauthenticated");
    const result = await runPublishingTick();
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
