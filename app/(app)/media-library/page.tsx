import { all } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/auth";
import { MediaClient } from "@/components/media-client";
import { PageHeader } from "@/components/ui";

export default async function MediaLibraryPage() {
  const ctx = await requirePermission("media.read");
  const assets = all<{
    id: string;
    name: string;
    kind: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    url: string | null;
    tags: string | null;
    alt_text: string | null;
    client_id: string | null;
    folder_id: string | null;
    usage_count: number;
    created_at: string;
  }>(
    `SELECT id, name, kind, mime_type, size_bytes, width, height, url, tags, alt_text, client_id, folder_id, usage_count, created_at
       FROM media_assets WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 300`,
    [ctx.workspace.id],
  );

  const folders = all<{ id: string; name: string; client_id: string | null }>(
    "SELECT id, name, client_id FROM media_folders WHERE workspace_id = ? ORDER BY name",
    [ctx.workspace.id],
  );
  const clients = all<{ id: string; name: string }>("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Publish"
        title="Media Library"
        description="Digital asset management with folders, tags, alt text, duplicate detection and expiring signed download links. Files live on local persistent storage by default."
      />
      <MediaClient initialAssets={assets} folders={folders} clients={clients} canWrite={hasPermission(ctx, "media.write")} />
    </div>
  );
}
