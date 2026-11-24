"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Badge, Banner, Card, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatNumber } from "@/lib/utils";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  logo_color: string;
  plan: string;
  is_demo: number;
  settings_json: string;
};

export function SettingsClient({
  workspace,
  counts,
  storageBytes,
  storageDir,
  meta,
  ai,
  email,
  canManage,
  account,
}: {
  workspace: Workspace;
  counts: { clients: number; members: number; posts: number; assets: number };
  storageBytes: number;
  storageDir: string;
  meta: { configured: boolean; graphVersion: string; redirectUri: string; webhookVerifyTokenSet: boolean };
  ai: { provider: string; configured: boolean; reachable: boolean | null; detail: string }[];
  email: { configured: boolean; from: string };
  canManage: boolean;
  account: { name: string; email: string; role: string; timezone: string };
}) {
  const toast = useToast();
  const settings = (() => {
    try {
      return JSON.parse(workspace.settings_json || "{}") as { holidays?: string[]; workingHours?: string };
    } catch {
      return {};
    }
  })();

  const [form, setForm] = useState({
    name: workspace.name,
    timezone: workspace.timezone,
    logoColor: workspace.logo_color,
    workingHours: settings.workingHours ?? "09:00-18:00",
    holidays: (settings.holidays ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await api("/api/v1/workspace", {
      method: "PATCH",
      json: {
        name: form.name,
        timezone: form.timezone,
        logoColor: form.logoColor,
        settings: {
          workingHours: form.workingHours,
          holidays: form.holidays.split(",").map((item) => item.trim()).filter(Boolean),
        },
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Workspace settings saved");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader
            title="Workspace"
            description="Name, timezone and calendar markers. Holidays appear on the social calendar."
            actions={<Badge status={workspace.is_demo ? "pending" : "approved"}>{workspace.is_demo ? "demo workspace" : "live"}</Badge>}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Workspace name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select className="select" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={!canManage}>
                {["UTC", "Europe/London", "Europe/Copenhagen", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney"].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Brand accent</label>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-12 rounded border border-[var(--line)] bg-transparent" value={form.logoColor} onChange={(e) => setForm({ ...form, logoColor: e.target.value })} disabled={!canManage} />
                <input className="input" value={form.logoColor} onChange={(e) => setForm({ ...form, logoColor: e.target.value })} disabled={!canManage} />
              </div>
            </div>
            <div>
              <label className="label">Working hours</label>
              <input className="input" value={form.workingHours} onChange={(e) => setForm({ ...form, workingHours: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <label className="label">Holidays (YYYY-MM-DD, comma separated)</label>
              <input className="input" value={form.holidays} onChange={(e) => setForm({ ...form, holidays: e.target.value })} disabled={!canManage} />
            </div>
          </div>
          {canManage && (
            <button className="btn btn-primary btn-sm mt-3" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save workspace"}
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {[
              ["Brands", counts.clients],
              ["Members", counts.members],
              ["Posts", counts.posts],
              ["Assets", counts.assets],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2 py-1.5">
                <p className="text-[var(--muted)]">{label}</p>
                <p className="text-[13px] font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Account" description="Your identity and role in this workspace." />
          <div className="mt-3 space-y-2 text-[12px]">
            <div className="flex justify-between border-b border-[var(--line)] pb-1.5"><span className="text-[var(--muted)]">Name</span><span>{account.name}</span></div>
            <div className="flex justify-between border-b border-[var(--line)] pb-1.5"><span className="text-[var(--muted)]">Email</span><span>{account.email}</span></div>
            <div className="flex justify-between border-b border-[var(--line)] pb-1.5"><span className="text-[var(--muted)]">Role</span><span>{account.role}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Timezone</span><span>{account.timezone}</span></div>
          </div>
          <Banner tone="info" title="Password & sessions">
            Sessions last 14 days and are stored as hashed tokens in the sessions table. Sign out from the top-right menu to revoke
            the current cookie. Password changes are not exposed in this UI — rotate via a server-side script or extend
            /api/v1/auth.
          </Banner>
          <div className="mt-3">
            <p className="label">Notification preferences</p>
            <a href="/notifications" className="btn btn-sm">Open notification settings</a>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionHeader title="Meta / Instagram" description="Server-side configuration only." />
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <div className="flex justify-between"><span className="text-[var(--muted)]">Status</span><Badge status={meta.configured ? "approved" : "failed"}>{meta.configured ? "configured" : "not configured"}</Badge></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Graph version</span><span className="font-mono text-[10.5px]">{meta.graphVersion}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Webhook token</span><span>{meta.webhookVerifyTokenSet ? "set" : "unset"}</span></div>
            <div className="truncate"><span className="text-[var(--muted)]">Redirect</span> <span className="font-mono text-[10px]">{meta.redirectUri}</span></div>
          </div>
          <a href="/integrations" className="btn btn-sm mt-2">Open Integration Center</a>
        </Card>

        <Card>
          <SectionHeader title="AI providers" description="Local-first with optional external adapters." />
          <div className="mt-2 space-y-1.5">
            {ai.map((provider) => (
              <div key={provider.provider} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2 py-1.5">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="capitalize">{provider.provider}</span>
                  <Badge status={provider.reachable || provider.configured ? "approved" : "draft"}>
                    {provider.provider === "template" ? "always on" : provider.reachable ? "reachable" : provider.configured ? "configured" : "off"}
                  </Badge>
                </div>
                <p className="text-[10px] text-[var(--muted)]">{provider.detail}</p>
              </div>
            ))}
          </div>
          <a href="/ai-assistant" className="btn btn-sm mt-2">Open assistant</a>
        </Card>

        <Card>
          <SectionHeader title="Storage & email" description="Where files and notifications go." />
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <div className="flex justify-between"><span className="text-[var(--muted)]">Upload directory</span><span className="font-mono text-[10px]">{storageDir}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Used</span><span>{formatNumber(Math.round(storageBytes / 1024))} KB</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Email (SMTP)</span><Badge status={email.configured ? "approved" : "draft"}>{email.configured ? "configured" : "off"}</Badge></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">From address</span><span className="max-w-[160px] truncate font-mono text-[10px]">{email.from}</span></div>
          </div>
          <Banner tone="warning" title="Persistent volumes">
            In Docker, mount the database directory and the storage directory as volumes. Containers without volumes lose uploads
            and SQLite data on recreation.
          </Banner>
        </Card>
      </div>
    </div>
  );
}
