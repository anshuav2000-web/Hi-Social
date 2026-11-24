"use client";

import { useState } from "react";
import { Loader2, Play, Plus, Power, Zap } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, SectionHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { label, timeAgo } from "@/lib/utils";

type Automation = {
  id: string;
  name: string;
  trigger_key: string;
  conditions_json: string;
  actions_json: string;
  is_enabled: number;
  last_run_at: string | null;
  run_count: number;
};

type Run = {
  id: string;
  automation_name: string;
  trigger_event: string;
  status: string;
  log: string | null;
  duration_ms: number | null;
  created_at: string;
};

export function AutomationsClient({
  initialAutomations,
  initialRuns,
  triggers,
  actions,
  canManage,
}: {
  initialAutomations: Automation[];
  initialRuns: Run[];
  triggers: readonly { key: string; label: string }[];
  actions: readonly { key: string; label: string }[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [automations, setAutomations] = useState(initialAutomations);
  const [runs, setRuns] = useState(initialRuns);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    trigger: triggers[0]?.key ?? "post.created",
    conditionField: "platform",
    conditionValue: "",
    actionType: actions[0]?.key ?? "notify",
    actionMessage: "",
    actionTarget: "role:workspace_admin",
  });

  const refresh = async () => {
    const res = await api<{ automations: Automation[]; runs: Run[] }>("/api/v1/automations");
    if (res.ok) {
      setAutomations(res.data.automations);
      setRuns(res.data.runs);
    }
  };

  const toggle = async (automation: Automation) => {
    setBusy(automation.id);
    const res = await api("/api/v1/automations", { method: "POST", json: { action: "toggle", id: automation.id } });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAutomations((prev) => prev.map((item) => (item.id === automation.id ? { ...item, is_enabled: item.is_enabled ? 0 : 1 } : item)));
    toast.success(automation.is_enabled ? "Automation disabled" : "Automation enabled");
  };

  const test = async (automation: Automation) => {
    setBusy(automation.id);
    const res = await api("/api/v1/automations", { method: "POST", json: { action: "test", id: automation.id } });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Rule executed", "Inspect the run log below.");
    await refresh();
  };

  const create = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy("create");
    const conditions = draft.conditionValue ? [{ field: draft.conditionField, op: "eq", value: draft.conditionValue }] : [{ field: "platform", op: "any" }];
    const res = await api("/api/v1/automations", {
      method: "POST",
      json: {
        action: "create",
        name: draft.name,
        trigger: draft.trigger,
        conditions,
        actions: [{ type: draft.actionType, message: draft.actionMessage || undefined, target: draft.actionTarget }],
      },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    toast.success("Automation created");
    setOpen(false);
    setDraft({ ...draft, name: "", actionMessage: "", conditionValue: "" });
    await refresh();
  };

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Rules run inside this application">
        Triggers fire from real events (post created, approval decided, publish failed, sync completed). Every run is logged with a
        status and loop protection (max depth 3).
      </Banner>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Automations ({automations.length})</p>
            <p className="text-[11.5px] text-[var(--muted)]">Visual rule builder: trigger → conditions → actions.</p>
          </div>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              <Plus size={12} /> New rule
            </button>
          )}
        </div>
        {automations.length === 0 ? (
          <EmptyState title="No automations" description="Create a rule to notify approvers, create follow-up tasks or request approvals automatically." icon={<Zap size={18} />} />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {automations.map((automation) => {
              let conditions: { field: string; op: string; value?: string }[] = [];
              let actions: { type: string; message?: string; target?: string }[] = [];
              try {
                conditions = JSON.parse(automation.conditions_json);
                actions = JSON.parse(automation.actions_json);
              } catch {
                /* keep empty */
              }
              return (
                <div key={automation.id} className="p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{automation.name}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        When <span className="text-[var(--fg)]">{triggers.find((t) => t.key === automation.trigger_key)?.label ?? automation.trigger_key}</span>
                        {conditions.length > 0 && ` · ${conditions.map((c) => `${c.field} ${c.op} ${c.value ?? ""}`).join(", ")}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        Then {actions.map((a) => `${a.type}${a.message ? `: ${a.message}` : ""}${a.target ? ` → ${a.target}` : ""}`).join(" + ")}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {automation.run_count} runs · last {automation.last_run_at ? timeAgo(automation.last_run_at) : "never"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge status={automation.is_enabled ? "approved" : "draft"}>{automation.is_enabled ? "Enabled" : "Disabled"}</Badge>
                      {canManage && (
                        <>
                          <button className="btn btn-sm" onClick={() => toggle(automation)} disabled={busy === automation.id}>
                            <Power size={11} /> {automation.is_enabled ? "Disable" : "Enable"}
                          </button>
                          <button className="btn btn-sm" onClick={() => test(automation)} disabled={busy === automation.id}>
                            {busy === automation.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Test
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13px] font-semibold">Run history</p>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>{["Automation", "Trigger", "Status", "Log", "Duration", "When"].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.automation_name}</td>
                  <td className="text-[11px] text-[var(--muted)]">{run.trigger_event}</td>
                  <td><Badge status={run.status === "succeeded" ? "published" : run.status === "skipped" ? "draft" : "failed"}>{label(run.status)}</Badge></td>
                  <td className="max-w-[320px] truncate text-[11px] text-[var(--muted)]">{run.log ?? "—"}</td>
                  <td className="text-[11px] text-[var(--muted)]">{run.duration_ms ?? 0}ms</td>
                  <td className="text-[10.5px] text-[var(--muted)]">{timeAgo(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">No runs recorded yet.</p>}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New automation rule"
        description="One trigger, optional condition, one action. Add more actions later from the API."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={busy === "create"}>Create rule</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Rule name</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Escalate failed publishes" />
          </div>
          <div>
            <label className="label">Trigger</label>
            <select className="select" value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}>
              {triggers.map((trigger) => <option key={trigger.key} value={trigger.key}>{trigger.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Condition field</label>
              <select className="select" value={draft.conditionField} onChange={(e) => setDraft({ ...draft, conditionField: e.target.value })}>
                {["platform", "client_id", "content_type", "status", "priority"].map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Equals</label>
              <input className="input" value={draft.conditionValue} onChange={(e) => setDraft({ ...draft, conditionValue: e.target.value })} placeholder="leave empty for any" />
            </div>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="select" value={draft.actionType} onChange={(e) => setDraft({ ...draft, actionType: e.target.value })}>
              {actions.map((action) => <option key={action.key} value={action.key}>{action.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Message / title</label>
            <input className="input" value={draft.actionMessage} onChange={(e) => setDraft({ ...draft, actionMessage: e.target.value })} />
          </div>
          <div>
            <label className="label">Target</label>
            <select className="select" value={draft.actionTarget} onChange={(e) => setDraft({ ...draft, actionTarget: e.target.value })}>
              <option value="role:workspace_admin">Workspace admins</option>
              <option value="role:approver">Approvers</option>
              <option value="role:social_media_manager">Social media managers</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
