import { all, get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { isQueuePaused, runPublishingTick } from "@/lib/publishing";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    const ctx = await guard("content.publish");
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const where = ["j.workspace_id = ?"];
    const params: unknown[] = [ctx.workspace.id];
    if (status && status !== "all") {
      if (status === "active") where.push("j.status IN ('queued','running')");
      else {
        where.push("j.status = ?");
        params.push(status);
      }
    }
    const rows = all(
      `SELECT j.*, p.title AS post_title, p.content_type, p.status AS post_status,
              c.name AS client_name, sa.name AS account_name, sa.status AS account_status,
              (SELECT COUNT(*) FROM publishing_attempts a WHERE a.job_id = j.id) AS attempt_count
         FROM publishing_jobs j
         JOIN social_posts p ON p.id = j.post_id
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN social_accounts sa ON sa.id = j.social_account_id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE j.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, j.run_at ASC
        LIMIT 200`,
      params,
    );

    const health = {
      queued: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status = 'queued'", [ctx.workspace.id])?.n ?? 0,
      running: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status = 'running'", [ctx.workspace.id])?.n ?? 0,
      failed: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status = 'failed'", [ctx.workspace.id])?.n ?? 0,
      dead: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status = 'dead'", [ctx.workspace.id])?.n ?? 0,
      succeeded: get<{ n: number }>("SELECT COUNT(*) AS n FROM publishing_jobs WHERE workspace_id = ? AND status = 'succeeded'", [ctx.workspace.id])?.n ?? 0,
      paused: isQueuePaused(ctx.workspace.id),
      nextRun: get<{ run_at: string | null }>(
        "SELECT MIN(run_at) AS run_at FROM publishing_jobs WHERE workspace_id = ? AND status = 'queued'",
        [ctx.workspace.id],
      )?.run_at ?? null,
    };
    return ok({ rows, health });
  } catch (err) {
    return handleApiError(err);
  }
}

const actionSchema = z.object({
  action: z.enum(["retry", "cancel", "pause", "resume", "reschedule", "tick"]),
  jobId: z.string().optional(),
  runAt: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("content.publish");
    const body = await parseJsonSafe(req);
    const ip = requestIp(req);

    if (body.action === "pause" || body.action === "resume") {
      const paused = body.action === "pause" ? 1 : 0;
      run(
        `INSERT INTO queue_state (workspace_id, is_paused, paused_by, updated_at) VALUES (?,?,?,?)
         ON CONFLICT(workspace_id) DO UPDATE SET is_paused = excluded.is_paused, paused_by = excluded.paused_by, updated_at = excluded.updated_at`,
        [ctx.workspace.id, paused, ctx.user.id, nowIso()],
      );
      logAudit(ctx, `queue.${body.action}`, "queue_state", ctx.workspace.id, {}, ip);
      return ok({ paused: Boolean(paused) });
    }

    if (body.action === "tick") {
      const result = await runPublishingTick(ctx.workspace.id);
      return ok(result);
    }

    if (!body.jobId) throw new ApiError("jobId is required", 422, "missing_job");
    const job = get<{ id: string; status: string; attempts: number }>(
      "SELECT id, status, attempts FROM publishing_jobs WHERE id = ? AND workspace_id = ?",
      [body.jobId, ctx.workspace.id],
    );
    if (!job) throw new ApiError("Job not found", 404, "not_found");

    if (body.action === "retry") {
      if (!["failed", "dead", "canceled"].includes(job.status)) {
        throw new ApiError("Only failed, dead or canceled jobs can be retried", 422, "invalid_state");
      }
      run(
        "UPDATE publishing_jobs SET status = 'queued', attempts = 0, run_at = ?, last_error = NULL, finished_at = NULL, updated_at = ? WHERE id = ?",
        [nowIso(), nowIso(), job.id],
      );
      logAudit(ctx, "queue.job_retried", "publishing_job", job.id, {}, ip);
    } else if (body.action === "cancel") {
      if (!["queued", "running", "failed"].includes(job.status)) throw new ApiError("Job cannot be canceled", 422, "invalid_state");
      run("UPDATE publishing_jobs SET status = 'canceled', finished_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), job.id]);
      logAudit(ctx, "queue.job_canceled", "publishing_job", job.id, {}, ip);
    } else if (body.action === "reschedule") {
      if (!body.runAt) throw new ApiError("runAt is required", 422, "missing_time");
      if (Number.isNaN(new Date(body.runAt).getTime())) throw new ApiError("Invalid runAt", 422, "invalid_time");
      run("UPDATE publishing_jobs SET status = 'queued', run_at = ?, updated_at = ? WHERE id = ?", [
        new Date(body.runAt).toISOString(),
        nowIso(),
        job.id,
      ]);
      logAudit(ctx, "queue.job_rescheduled", "publishing_job", job.id, { runAt: body.runAt }, ip);
    }
    return ok({ id: job.id, action: body.action });
  } catch (err) {
    return handleApiError(err);
  }
}

async function parseJsonSafe(req: Request): Promise<z.infer<typeof actionSchema>> {
  const raw = await req.json().catch(() => null);
  if (raw === null) throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
  return parsed.data;
}
