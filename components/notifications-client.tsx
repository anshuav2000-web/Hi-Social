"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, formatDateTime, label } from "@/lib/utils";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;
  created_at: string;
};

type Preferences = { email?: boolean; inApp?: boolean; browser?: boolean; digest?: "daily" | "weekly" | "off" };

export function NotificationsClient({
  initialRows,
  initialPreferences,
  channels,
  notes,
}: {
  initialRows: Notification[];
  initialPreferences: Preferences;
  channels: { inApp: boolean; email: boolean; browser: boolean };
  notes: string;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [saving, setSaving] = useState(false);

  const markAll = async () => {
    await api("/api/v1/notifications", { method: "POST", json: { action: "read_all" } });
    setRows((prev) => prev.map((row) => ({ ...row, is_read: 1 })));
    toast.success("All notifications marked read");
  };

  const savePrefs = async () => {
    setSaving(true);
    const res = await api("/api/v1/notifications", { method: "POST", json: { action: "prefs", preferences: prefs } });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Preferences saved");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Notification center</p>
            <p className="text-[11.5px] text-[var(--muted)]">{rows.filter((row) => !row.is_read).length} unread</p>
          </div>
          <button className="btn btn-sm" onClick={markAll}>
            <CheckCheck size={12} /> Mark all read
          </button>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No notifications" description="Approvals, publishing results and automation alerts appear here." icon={<BellRing size={18} />} />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={row.link ?? "/dashboard"}
                className={cn("block px-4 py-2.5 hover:bg-[var(--card-3)]", !row.is_read && "bg-[var(--brand-soft)]/40")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium">{row.title}</p>
                    {row.body && <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">{row.body}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge>{label(row.kind)}</Badge>
                    <span className="text-[10px] text-[var(--muted)]">{formatDateTime(row.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <Card>
          <SectionHeader title="Delivery channels" description="What this deployment can actually deliver." />
          <div className="mt-2 space-y-1.5">
            {[
              ["In-app", channels.inApp, "Always available."],
              ["Email", channels.email, channels.email ? "SMTP configured." : "Set SMTP_URL to enable email delivery."],
              ["Browser push", channels.browser, "Requires a service worker + VAPID keys; not enabled."],
            ].map(([name, enabled, detail]) => (
              <div key={String(name)} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5">
                <div>
                  <p className="text-[12px]">{String(name)}</p>
                  <p className="text-[10px] text-[var(--muted)]">{String(detail)}</p>
                </div>
                <Badge status={enabled ? "approved" : "draft"}>{enabled ? "enabled" : "off"}</Badge>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-[var(--muted)]">{notes}</p>
        </Card>

        <Card>
          <SectionHeader title="Your preferences" description="Stored on your user record." />
          <div className="mt-2 space-y-2">
            {[
              ["inApp", "In-app notifications"],
              ["email", "Email notifications"],
              ["browser", "Browser notifications"],
            ].map(([key, labelText]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5 text-[12px]">
                <span>{labelText}</span>
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key as keyof Preferences])}
                  onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                  className="accent-[var(--brand)]"
                />
              </label>
            ))}
            <div>
              <label className="label">Digest frequency</label>
              <select className="select" value={prefs.digest ?? "weekly"} onChange={(e) => setPrefs({ ...prefs, digest: e.target.value as Preferences["digest"] })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="off">Off</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm w-full" onClick={savePrefs} disabled={saving}>
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </Card>

        <Banner tone="info" title="Task and approval reminders">
          Reminders are generated by automations and the publishing worker, not by a separate cron service. Add a rule in
          Workflow Automation to notify owners about overdue tasks.
        </Banner>
      </div>
    </div>
  );
}
