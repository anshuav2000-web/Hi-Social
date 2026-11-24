import { z } from "zod";
import { all, get, nowIso, run } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { runAutomations } from "@/lib/automations";

export async function GET(req: Request) {
  try {
    const ctx = await guard("content.read");
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const where = ["ca.workspace_id = ?"];
    const params: unknown[] = [ctx.workspace.id];
    if (status !== "all") {
      where.push("ca.status = ?");
      params.push(status);
    }
    const rows = all(
      `SELECT ca.*, p.title AS post_title, p.platform, p.content_type, ca.stage,
              c.name AS client_name, u.full_name AS reviewer_name, p.scheduled_at, p.caption
         FROM content_approvals ca
         JOIN social_posts p ON p.id = ca.post_id
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN users u ON u.id = ca.reviewer_id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END, ca.due_at ASC LIMIT 200`,
      params,
    );
    return ok({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}

const decisionSchema = z.object({
  approvalId: z.string().min(3),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  feedback: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("content.approve");
    const body = await parseJson(req, decisionSchema);
    const approval = get<{
      id: string;
      post_id: string;
      stage: string;
      status: string;
      workspace_id: string;
      reviewer_id: string | null;
    }>("SELECT * FROM content_approvals WHERE id = ? AND workspace_id = ?", [body.approvalId, ctx.workspace.id]);
    if (!approval) throw new ApiError("Approval not found", 404, "not_found");
    if (approval.status !== "pending") throw new ApiError("This stage has already been decided", 409, "already_decided");

    const post = get<{ id: string; title: string; client_id: string | null; assigned_writer_id: string | null; reviewer_id: string | null }>(
      "SELECT id, title, client_id, assigned_writer_id, reviewer_id FROM social_posts WHERE id = ?",
      [approval.post_id],
    );
    if (!post) throw new ApiError("Post not found", 404, "not_found");

    const now = nowIso();
    run("UPDATE content_approvals SET status = ?, decided_by = ?, feedback = ?, decided_at = ? WHERE id = ?", [
      body.decision,
      ctx.user.id,
      body.feedback ?? null,
      now,
      approval.id,
    ]);

    // Multi-stage workflow: only advance when every stage is approved.
    const stages = all<{ status: string }>("SELECT status FROM content_approvals WHERE post_id = ?", [approval.post_id]);
    const allApproved = stages.length > 0 && stages.every((s) => s.status === "approved");
    const anyRejected = stages.some((s) => ["rejected", "changes_requested"].includes(s.status));

    if (body.decision === "approved" && allApproved) {
      run("UPDATE social_posts SET status = 'approved', updated_at = ? WHERE id = ?", [now, approval.post_id]);
      runAutomations(ctx.workspace.id, "post.approved", { postId: approval.post_id, client_id: post.client_id });
    } else if (body.decision !== "approved") {
      run("UPDATE social_posts SET status = 'changes_requested', updated_at = ? WHERE id = ?", [now, approval.post_id]);
      runAutomations(ctx.workspace.id, "post.rejected", { postId: approval.post_id, client_id: post.client_id });
    }

    notifyMany([post.assigned_writer_id, post.reviewer_id], {
      workspaceId: ctx.workspace.id,
      kind: "approval_decided",
      title: body.decision === "approved" ? "Approval granted" : body.decision === "rejected" ? "Post rejected" : "Changes requested",
      body: `“${post.title}” — ${approval.stage.replace(/_/g, " ")}${body.feedback ? `: ${body.feedback.slice(0, 140)}` : ""}`,
      link: "/approvals",
    });
    logAudit(ctx, `approval.${body.decision}`, "content_approval", approval.id, { postId: approval.post_id, stage: approval.stage }, requestIp(req));
    return ok({ id: approval.id, status: body.decision, postStatus: anyRejected ? "changes_requested" : allApproved ? "approved" : "review", allApproved });
  } catch (err) {
    return handleApiError(err);
  }
}
