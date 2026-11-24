"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileVideo, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Card, EmptyState, SectionHeader, Banner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { formatDate, formatNumber } from "@/lib/utils";

type Asset = {
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
  client_name?: string | null;
  folder_id: string | null;
  usage_count: number;
  created_at: string;
  uploaded_by_name?: string | null;
};

type Folder = { id: string; name: string; client_id: string | null };

const aspect = (width: number | null, height: number | null) => {
  if (!width || !height) return "—";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.03) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.03) return "4:5";
  if (Math.abs(ratio - 0.5625) < 0.03) return "9:16";
  if (Math.abs(ratio - 1.7778) < 0.03) return "16:9";
  return `${ratio.toFixed(2)}:1`;
};

export function MediaClient({
  initialAssets,
  folders,
  clients,
  canWrite,
}: {
  initialAssets: Asset[];
  folders: Folder[];
  clients: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [clientId, setClientId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadClient, setUploadClient] = useState(clients[0]?.id ?? "");
  const [uploadTags, setUploadTags] = useState("");
  const [detail, setDetail] = useState<{ signedUrl: string; postCount: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (kind) query.set("kind", kind);
    if (clientId) query.set("client_id", clientId);
    if (folderId) query.set("folder_id", folderId);
    const res = await api<{ rows: Asset[] }>(`/api/v1/media?${query.toString()}`);
    if (res.ok) setAssets(res.data.rows);
  }, [search, kind, clientId, folderId]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 220 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const openDetail = async (asset: Asset) => {
    setSelected(asset);
    setDetail(null);
    const res = await api<{ signedUrl: string; postCount: number }>(`/api/v1/media/${asset.id}`);
    if (res.ok) setDetail(res.data);
  };

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    if (uploadClient) form.set("client_id", uploadClient);
    if (uploadTags) form.set("tags", uploadTags);
    const res = await api<Asset>("/api/v1/media", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      toast.error("Upload failed", res.error);
      return;
    }
    toast.success("Asset uploaded", file.name);
    setAssets((prev) => [res.data, ...prev]);
    setUploadTags("");
  };

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Delete “${asset.name}”? Soft delete — rows and usage history stay in the database.`)) return;
    const res = await api(`/api/v1/media/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Asset deleted");
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setSelected(null);
  };

  const saveMeta = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    const res = await api(`/api/v1/media/${selected.id}`, { method: "PATCH", json: payload });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Asset updated");
    setAssets((prev) => prev.map((a) => (a.id === selected.id ? { ...a, ...payload } as Asset : a)));
    setSelected({ ...selected, ...payload } as Asset);
  };

  const grouped = useMemo(() => assets, [assets]);
  const totalBytes = assets.reduce((sum, asset) => sum + (asset.size_bytes ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card
        className={dragging ? "drop-target" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && canWrite) void upload(file);
        }}
      >
        <SectionHeader
          title="Upload"
          description="Drop a file here or use the button. PNG, JPEG, WebP, GIF, SVG, MP4, MOV and WebM up to 25 MB."
          actions={
            canWrite ? (
              <button className="btn btn-primary btn-sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Upload size={12} /> {uploading ? "Uploading…" : "Choose file"}
              </button>
            ) : undefined
          }
        />
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept="image/*,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="label">Assign to client</label>
            <select className="select" value={uploadClient} onChange={(e) => setUploadClient(e.target.value)}>
              <option value="">— none —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags</label>
            <input className="input" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="product, hero, q4" />
          </div>
        </div>
        <p className="mt-2 text-[10.5px] text-[var(--muted)]">
          {assets.length} assets · {formatNumber(Math.round(totalBytes / 1024))} KB in this view. Duplicate detection uses a SHA-256 checksum.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
          <input className="input h-8 flex-1 min-w-[160px] text-[12px]" placeholder="Search name, tags, alt text…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select h-8 w-auto text-[11.5px]" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
          <select className="select h-8 w-auto text-[11.5px]" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select className="select h-8 w-auto text-[11.5px]" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">All folders</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </div>

        {grouped.length === 0 ? (
          <EmptyState title="No assets" description="Upload brand images and video cutdowns to use them in posts." icon={<ImageIcon size={18} />} />
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {grouped.map((asset) => (
              <button key={asset.id} onClick={() => openDetail(asset)} className="group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card-2)] text-left hover:border-[var(--brand)]">
                {asset.mime_type.startsWith("image/") ? (
                  <img src={asset.url ?? ""} alt={asset.alt_text ?? asset.name} className="aspect-square w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-[var(--navy)] text-[var(--muted)]"><FileVideo size={26} /></div>
                )}
                <div className="p-1.5">
                  <p className="truncate text-[11px] font-medium">{asset.name}</p>
                  <p className="text-[9.5px] text-[var(--muted)]">
                    {asset.width && asset.height ? `${asset.width}×${asset.height} · ${aspect(asset.width, asset.height)}` : asset.kind}
                    {asset.usage_count > 0 ? ` · used ${asset.usage_count}×` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Asset"}
        description={selected ? `${selected.mime_type} · ${formatNumber(Math.round(selected.size_bytes / 1024))} KB · uploaded ${formatDate(selected.created_at)}` : undefined}
        size="lg"
        footer={
          selected ? (
            <>
              {detail && (
                <a href={detail.signedUrl} download className="btn btn-sm">
                  <Download size={12} /> Download
                </a>
              )}
              {canWrite && (
                <button className="btn btn-sm btn-danger" onClick={() => remove(selected)}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              {selected.mime_type.startsWith("image/") ? (
                <img src={selected.url ?? ""} alt={selected.alt_text ?? selected.name} className="w-full rounded-lg border border-[var(--line)] object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--navy)]"><FileVideo size={30} /></div>
              )}
              <div className="mt-2 space-y-1 text-[11px] text-[var(--muted)]">
                <p>Dimensions: {selected.width && selected.height ? `${selected.width} × ${selected.height} (${aspect(selected.width, selected.height)})` : "unknown"}</p>
                <p>Usage: {detail?.postCount ?? selected.usage_count} post(s)</p>
                <p>Client: {clients.find((c) => c.id === selected.client_id)?.name ?? "unassigned"}</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="label">Name</label>
                <input className="input" defaultValue={selected.name} onBlur={(e) => e.target.value !== selected.name && saveMeta({ name: e.target.value })} disabled={!canWrite} />
              </div>
              <div>
                <label className="label">Tags</label>
                <input className="input" defaultValue={selected.tags ?? ""} onBlur={(e) => e.target.value !== selected.tags && saveMeta({ tags: e.target.value })} disabled={!canWrite} />
              </div>
              <div>
                <label className="label">Alt text</label>
                <textarea className="textarea" rows={2} defaultValue={selected.alt_text ?? ""} onBlur={(e) => e.target.value !== selected.alt_text && saveMeta({ alt_text: e.target.value })} disabled={!canWrite} />
              </div>
              <div>
                <label className="label">Secure download link (expires in 1 hour)</label>
                <div className="flex gap-1.5">
                  <input className="input font-mono text-[10.5px]" readOnly value={detail?.signedUrl ?? "generating…"} />
                  <button
                    className="btn btn-sm"
                    onClick={() => detail && navigator.clipboard.writeText(`${window.location.origin}${detail.signedUrl}`).then(() => toast.success("Signed URL copied"))}
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
              {detail && detail.postCount > 0 && <Badge status="published">Used in {detail.postCount} post(s)</Badge>}
              {!detail && <p className="text-[11px] text-[var(--muted)]">Loading signed URL…</p>}
            </div>
          </div>
        )}
      </Modal>

      {folders.length === 0 && (
        <Banner tone="info" title="No folders yet">
          Create folders from the API or seed data to group assets per client. Folder filtering is wired to media_folders.
        </Banner>
      )}
    </div>
  );
}
