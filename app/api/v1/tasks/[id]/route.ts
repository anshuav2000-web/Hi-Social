import { z } from "zod";
import { all, get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("task.read");
    const task = get<Record<string, unknown>>(
      `SELECT t.*, u.full_name AS assignee_name, u.avatar_color AS assignee_color, r.full_name AS reviewer_name,
              p.title AS post_title, c.name AS client_name
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN users r ON r.id = t.reviewer_id
         LEFT JOIN social_posts p ON p.id = t.post_id LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.id = ? AND t.workspace_id = ?`,
      [id, ctx.workspace.id],
    );
    if (!task) throw new ApiError("Task not found", 404, "not_found");
    const comments = all(
      `SELECT tc.*, u.full_name, u.avatar_color FROM task_comments tc JOIN users u ON u.id = tc.user_id
        WHERE tc.task_id = ? ORDER BY tc.created_at ASC`,
      [id],
    );
    const checklist = all("SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position ASC", [id]);
    const subtasks = all("SELECT id, title, status, assignee_id FROM tasks WHERE parent_task_id = ? ORDER BY created_at ASC", [id]);
    const attachments = all("SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC", [id]);
    return ok({ task, comments, checklist, subtasks, attachments });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  action: z.enum(["comment", "checklist_add", "checklist_toggle", "status", "subtask", "dependency", "assign"]),
  body: z.string().max(4000).optional(),
  label: z.string().max(300).optional(),
  itemId: z.string().optional(),
  status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  title: z.string().max(300).optional(),
  dependsOn: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("task.write");
    const body = await parseJson(req, schema);
    const task = get<{ id: string; status: string; title: string; workspace_id: string }>(
      "SELECT id, status, title, workspace_id FROM tasks WHERE id = ? AND workspace_id = ?",
      [id, ctx.workspace.id],
    );
    if (!task) throw new ApiError("Task not found", 404, "not_found");

    switch (body.action) {
      case "comment":
        if (!body.body?.trim()) throw new ApiError("Comment cannot be empty", 422, "empty_comment");
        run("INSERT INTO task_comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)", [
          uid(),
          id,
          ctx.user.id,
          body.body,
          nowIso(),
        ]);
        break;
      case "checklist_add":
        if (!body.label?.trim()) throw new ApiError("Label is required", 422, "missing_label");
        run("INSERT INTO task_checklist_items (id, task_id, label, is_done, position) VALUES (?,?,?,0,?)", [
          uid(),
          id,
          body.label,
          Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM task_checklist_items WHERE task_id = ?", [id])?.n ?? 0),
        ]);
        break;
      case "checklist_toggle": {
        if (!body.itemId) throw new ApiError("itemId is required", 422, "missing_item");
        const item = get<{ is_done: number }>("SELECT is_done FROM task_checklist_items WHERE id = ? AND task_id = ?", [body.itemId, id]);
        if (!item) throw new ApiError("Checklist item not found", 404, "not_found");
        run("UPDATE task_checklist_items SET is_done = ? WHERE id = ?", [item.is_done ? 0 : 1, body.itemId]);
        break;
      }
      case "status": {
        if (!body.status) throw new ApiError("status is required", 422, "missing_status");
        const dependencies = get<{ status: string; title: string }>(
          `SELECT status, title FROM tasks WHERE id = (SELECT depends_on_task_id FROM tasks WHERE id = ?)`,
          [id],
        );
        if (body.status === "done" && dependencies && dependencies.status !== "done") {
          throw new ApiError(`Blocked by dependency: “${dependencies.title}” is still ${dependencies.status.replace(/_/g, " ")}.`, 422, "blocked_by_dependency");
        }
        run("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?", [
          body.status,
          body.status === "done" ? nowIso() : null,
          id,
        ]);
        break;
      }
      case "subtask":
        if (!body.title?.trim()) throw new ApiError("Title is required", 422, "missing_title");
        run(
          `INSERT INTO tasks (id, workspace_id, client_id, post_id, title, description, kind, status, priority, assignee_id,
            reviewer_id, due_date, parent_task_id, depends_on_task_id, recurring_rule, created_by, created_at, completed_at)
           SELECT ?, workspace_id, client_id, post_id, ?, NULL, kind, 'todo', priority, ?, NULL, due_date, ?, NULL, NULL, ?, ?, NULL
             FROM tasks WHERE id = ?`,
          [uid(), body.title, body.assigneeId ?? null, id, ctx.user.id, nowIso(), id],
        );
        break;
      case "dependency":
        run("UPDATE tasks SET depends_on_task_id = ? WHERE id = ?", [body.dependsOn ?? null, id]);
        break;
      case "assign":
        run("UPDATE tasks SET assignee_id = ? WHERE id = ?", [body.assigneeId ?? null, id]);
        break;
    }
    logAudit(ctx, `task.${body.action}`, "task", id, body, requestIp(req));
    return ok({ id, action: body.action });
  } catch (err) {
    return handleApiError(err);
  }
}
