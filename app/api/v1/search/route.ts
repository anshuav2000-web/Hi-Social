import { all } from "@/lib/db";
import { handleApiError, ok } from "@/lib/http";
import { guard, scopedClientIds } from "@/lib/api-guard";

/**
 * Global search across the workspace. Every query is workspace-scoped and
 * permission-checked; client viewers only see their own client's records.
 */
export async function GET(req: Request) {
  try {
    const ctx = await guard("workspace.read");
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return ok({ groups: [] });
    const like = `%${q}%`;
    const scoped = scopedClientIds(ctx);
    const clientFilter = scoped && scoped.length > 0 ? ` AND client_id IN (${scoped.map(() => "?").join(",")})` : scoped ? " AND 1 = 0" : "";
    const clientParams = scoped && scoped.length > 0 ? scoped : [];

    const groups: { label: string; items: { id: string; title: string; subtitle: string; href: string }[] }[] = [];

    const posts = all<{ id: string; title: string; platform: string; status: string }>(
      `SELECT id, title, platform, status FROM social_posts WHERE workspace_id = ? AND (title LIKE ? OR caption LIKE ?)${clientFilter} LIMIT 6`,
      [ctx.workspace.id, like, like, ...clientParams],
    );
    if (posts.length)
      groups.push({
        label: "Content",
        items: posts.map((p) => ({ id: p.id, title: p.title, subtitle: `${p.platform} · ${p.status.replace(/_/g, " ")}`, href: `/content-studio?post=${p.id}` })),
      });

    const clients = all<{ id: string; name: string; industry: string | null }>(
      `SELECT id, name, industry FROM clients WHERE workspace_id = ? AND name LIKE ? LIMIT 4`,
      [ctx.workspace.id, like],
    );
    if (clients.length)
      groups.push({
        label: "Brands",
        items: clients.map((c) => ({ id: c.id, title: c.name, subtitle: c.industry ?? "Brand", href: `/clients?client=${c.id}` })),
      });

    const tasks = all<{ id: string; title: string; status: string }>(
      `SELECT id, title, status FROM tasks WHERE workspace_id = ? AND title LIKE ? LIMIT 4`,
      [ctx.workspace.id, like],
    );
    if (tasks.length)
      groups.push({
        label: "Tasks",
        items: tasks.map((t) => ({ id: t.id, title: t.title, subtitle: t.status.replace(/_/g, " "), href: `/tasks?task=${t.id}` })),
      });

    const media = all<{ id: string; name: string }>(
      `SELECT id, name FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL AND name LIKE ? LIMIT 4`,
      [ctx.workspace.id, like],
    );
    if (media.length)
      groups.push({
        label: "Media",
        items: media.map((m) => ({ id: m.id, title: m.name, subtitle: "Asset", href: `/media-library?asset=${m.id}` })),
      });

    const campaigns = all<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM campaigns WHERE workspace_id = ? AND name LIKE ? LIMIT 4`,
      [ctx.workspace.id, like],
    );
    if (campaigns.length)
      groups.push({
        label: "Campaigns",
        items: campaigns.map((c) => ({ id: c.id, title: c.name, subtitle: c.status, href: `/campaigns?campaign=${c.id}` })),
      });

    const conversations = all<{ id: string; subject: string | null; participant_name: string | null }>(
      `SELECT id, subject, participant_name FROM inbox_conversations WHERE workspace_id = ? AND (subject LIKE ? OR participant_name LIKE ?) LIMIT 3`,
      [ctx.workspace.id, like, like],
    );
    if (conversations.length)
      groups.push({
        label: "Inbox",
        items: conversations.map((c) => ({ id: c.id, title: c.subject ?? "Conversation", subtitle: c.participant_name ?? "", href: `/inbox?conversation=${c.id}` })),
      });

    return ok({ groups });
  } catch (err) {
    return handleApiError(err);
  }
}
