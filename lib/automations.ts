import "server-only";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { enqueue } from "@/lib/publishing";

export const TRIGGERS = [
  { key: "post.created", label: "New content created" },
  { key: "post.approved", label: "Post approved" },
  { key: "post.rejected", label: "Post rejected / changes requested" },
  { key: "post.review_requested", label: "Post submitted for review" },
  { key: "publish.succeeded", label: "Post published" },
  { key: "publish.failed", label: "Publishing failed" },
  { key: "task.overdue", label: "Task overdue" },
  { key: "comment.received", label: "New comment received" },
  { key: "sync.completed", label: "Sync completed" },
  { key: "campaign.ending", label: "Campaign ending" },
] as const;

export const ACTIONS = [
  { key: "notify", label: "Send notification" },
  { key: "create_task", label: "Create task" },
  { key: "assign", label: "Assign post owner" },
  { key: "change_status", label: "Change post status" },
  { key: "request_approval", label: "Request approval" },
  { key: "add_to_queue", label: "Add to publishing queue" },
  { key: "generate_report", label: "Generate report record" },
] as const;

type Condition = { field: string; op: "eq" | "neq" | "in" | "gte" | "lte" | "any"; value?: string };
type Action = { type: string; target?: string; message?: string; title?: string; status?: string; stage?: string };

const depth = new Map<string, number>();

export function runAutomations(workspaceId: string, triggerKey: string, payload: Record<string, unknown>) {
  const chain = Number(payload.__depth ?? 0);
  if (chain > 3) return { skipped: "loop-guard" as const };
  const rows = all<{
    id: string;
    name: string;
    conditions_json: string;
    actions_json: string;
  }>("SELECT id, name, conditions_json, actions_json FROM automations WHERE workspace_id = ? AND trigger_key = ? AND is_enabled = 1", [
    workspaceId,
    triggerKey,
  ]);

  const postId = typeof payload.postId === "string" ? payload.postId : null;
  const post = postId
    ? get<Record<string, unknown>>("SELECT * FROM social_posts WHERE id = ? AND workspace_id = ?", [postId, workspaceId])
    : null;

  for (const automation of rows) {
    const guardKey = `${automation.id}:${postId ?? "none"}`;
    if ((depth.get(guardKey) ?? 0) > 2) continue;
    depth.set(guardKey, (depth.get(guardKey) ?? 0) + 1);

    const conditions = safeJson<Condition[]>(automation.conditions_json, []);
    const actions = safeJson<Action[]>(automation.actions_json, []);
    const matched = conditions.every((c) => evaluate(c, { ...payload, ...(post ?? {}) }));
    if (!matched) {
      run(
        `INSERT INTO automation_runs (id, automation_id, workspace_id, trigger_event, status, log, duration_ms, created_at)
         VALUES (?,?,?,?,'skipped',?,?,?)`,
        [uid(), automation.id, workspaceId, triggerKey, "Conditions did not match", 3, nowIso()],
      );
      continue;
    }

    const log: string[] = [];
    let status = "succeeded";
    const started = Date.now();
    for (const action of actions) {
      try {
        executeAction(workspaceId, action, post ?? null, payload, log);
      } catch (err) {
        status = "failed";
        log.push(`Action ${action.type} failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
    const duration = Date.now() - started;
    run(
      `INSERT INTO automation_runs (id, automation_id, workspace_id, trigger_event, status, log, duration_ms, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uid(), automation.id, workspaceId, triggerKey, status, log.join(" | "), duration, nowIso()],
    );
    run("UPDATE automations SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?", [nowIso(), automation.id]);
  }
  return { ran: rows.length };
}

function evaluate(condition: Condition, ctx: Record<string, unknown>): boolean {
  const raw = ctx[condition.field];
  const value = raw === undefined || raw === null ? "" : String(raw);
  switch (condition.op) {
    case "any":
      return true;
    case "eq":
      return value === String(condition.value ?? "");
    case "neq":
      return value !== String(condition.value ?? "");
    case "in":
      return String(condition.value ?? "")
        .split(",")
        .map((s) => s.trim())
        .includes(value);
    case "gte":
      return Number(raw ?? 0) >= Number(condition.value ?? 0);
    case "lte":
      return Number(raw ?? 0) <= Number(condition.value ?? 0);
    default:
      return false;
  }
}

function executeAction(
  workspaceId: string,
  action: Action,
  post: Record<string, unknown> | null,
  payload: Record<string, unknown>,
  log: string[],
) {
  switch (action.type) {
    case "notify": {
      const target = action.target ?? "role:workspace_admin";
      const users =
        target.startsWith("role:")
          ? all<{ user_id: string }>(
              "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role_key = ? AND status = 'active'",
              [workspaceId, target.slice(5)],
            ).map((r) => r.user_id)
          : [target];
      for (const userId of users) {
        notify({
          workspaceId,
          userId,
          kind: "automation",
          title: "Automation",
          body: action.message ?? "Automation rule fired",
          link: "/workflow-automation",
        });
      }
      log.push(`Notified ${users.length} user(s)`);
      break;
    }
    case "create_task": {
      run(
        `INSERT INTO tasks (id, workspace_id, client_id, post_id, title, description, kind, status, priority, assignee_id,
          reviewer_id, due_date, parent_task_id, depends_on_task_id, recurring_rule, created_by, created_at, completed_at)
         VALUES (?,?,?,?,?,?,'other','todo','medium',NULL,NULL,?,NULL,NULL,NULL,NULL,?,NULL)`,
        [
          uid(),
          workspaceId,
          (post?.client_id as string) ?? null,
          (post?.id as string) ?? null,
          action.title ?? "Automation follow-up",
          `Created by automation${action.message ? `: ${action.message}` : ""}`,
          new Date(Date.now() + 2 * 86400000).toISOString(),
          nowIso(),
        ],
      );
      log.push("Task created");
      break;
    }
    case "assign": {
      if (post && action.target) {
        run("UPDATE social_posts SET assigned_writer_id = ?, updated_at = ? WHERE id = ?", [action.target, nowIso(), post.id]);
        log.push("Post assignee updated");
      }
      break;
    }
    case "change_status": {
      if (post && action.status) {
        run("UPDATE social_posts SET status = ?, updated_at = ? WHERE id = ?", [action.status, nowIso(), post.id]);
        log.push(`Status → ${action.status}`);
      }
      break;
    }
    case "request_approval": {
      if (post) {
        run(
          `INSERT INTO content_approvals (id, workspace_id, post_id, stage, status, reviewer_id, decided_by, feedback, due_at, created_at, decided_at)
           VALUES (?,?,?,?,'pending',?,NULL,NULL,?,?,NULL)`,
          [uid(), workspaceId, post.id, action.stage ?? "internal_review", (post.reviewer_id as string) ?? null, new Date(Date.now() + 86400000).toISOString(), nowIso()],
        );
        log.push("Approval requested");
      }
      break;
    }
    case "add_to_queue": {
      if (!post) {
        log.push("No post on this event — nothing queued");
        break;
      }
      const accountId = (post.social_account_id as string) ?? (payload.accountId as string);
      if (!accountId) {
        log.push("Post has no connected account — nothing queued");
        break;
      }
      const pending = get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM content_approvals WHERE post_id = ? AND workspace_id = ? AND status = 'pending'",
        [post.id as string, workspaceId],
      );
      if (Number(pending?.n ?? 0) > 0) {
        log.push("Blocked: post has a pending approval stage");
        break;
      }
      const account = get<{ status: string }>(
        "SELECT status FROM social_accounts WHERE id = ? AND workspace_id = ?",
        [accountId, workspaceId],
      );
      const runAt = (post.scheduled_at as string) ?? new Date(Date.now() + 3600_000).toISOString();
      const channel = account?.status === "connected" ? "live" : "sandbox";
      const result = enqueue({
        workspaceId,
        postId: post.id as string,
        accountId,
        runAt,
        channel,
        actorId: (payload.__actorId as string) ?? "automation",
      });
      log.push(result.duplicate ? "Already queued (duplicate suppressed)" : `Queued job ${result.jobId} on ${channel}`);
      break;
    }
    case "generate_report": {
      run(
        `INSERT INTO reports (id, workspace_id, client_id, name, kind, period_start, period_end, format, status, payload_json, created_by, created_at)
         VALUES (?,?,?,?,'monthly',?,?,'pdf','ready',NULL,NULL,?)`,
        [
          uid(),
          workspaceId,
          (post?.client_id as string) ?? null,
          action.title ?? "Automated report",
          new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10),
          nowIso(),
        ],
      );
      log.push("Report record created");
      break;
    }
    default:
      log.push(`Unknown action ${action.type}`);
  }
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
