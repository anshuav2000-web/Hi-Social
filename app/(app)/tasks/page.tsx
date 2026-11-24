import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { TasksClient } from "@/components/tasks-client";
import { PageHeader } from "@/components/ui";

export default async function TasksPage() {
  const ctx = await requirePermission("task.read");
  const tasks = all<{
    id: string;
    title: string;
    description: string | null;
    kind: string;
    status: string;
    priority: string;
    assignee_id: string | null;
    assignee_name: string | null;
    assignee_color: string | null;
    client_id: string | null;
    client_name: string | null;
    post_id: string | null;
    post_title: string | null;
    due_date: string | null;
    depends_on_task_id: string | null;
    completed_at: string | null;
  }>(
    `SELECT t.id, t.title, t.description, t.kind, t.status, t.priority, t.assignee_id,
            u.full_name AS assignee_name, u.avatar_color AS assignee_color,
            t.client_id, c.name AS client_name, t.post_id, p.title AS post_title,
            t.due_date, t.depends_on_task_id, t.completed_at
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN social_posts p ON p.id = t.post_id
      WHERE t.workspace_id = ? AND t.parent_task_id IS NULL
      ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 ELSE 3 END, t.due_date ASC
      LIMIT 300`,
    [ctx.workspace.id],
  );

  const members = all<{ id: string; full_name: string; avatar_color: string }>(
    `SELECT u.id, u.full_name, u.avatar_color FROM users u JOIN workspace_members wm ON wm.user_id = u.id
      WHERE wm.workspace_id = ? AND wm.status = 'active' ORDER BY u.full_name`,
    [ctx.workspace.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Brands & team"
        title="Task Management"
        description="Production board with checklists, subtasks, dependencies, comments and deadlines. Tasks can be linked to the post they serve."
      />
      <TasksClient initialTasks={tasks} members={members} canWrite={hasPermission(ctx, "task.write")} />
    </div>
  );
}
