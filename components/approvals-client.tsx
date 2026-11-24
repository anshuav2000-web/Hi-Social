"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, PlatformDot, SectionHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { cn, formatDate, formatDateTime, label } from "@/lib/utils";

type Approval = {
  id: string;
  post_id: string;
  post_title: string;
  platform: string;
  content_type: string;
  stage: string;
  status: string;
  client_name: string | null;
  reviewer_name: string | null;
  due_at: string | null;
  decided_at: string | null;
  feedback: string | null;
  caption: string | null;
  scheduled_at: string | null;
};

export function ApprovalsClient({ initialApprovals, canApprove }: { initialApprovals: Approval[]; canApprove: boolean }) {
  const toast = useToast();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [active, setActive] = useState<Approval | null>(null);
  const [decision, setDecision] = useState<"approved" | "changes_requested" | "rejected">("approved");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => approvals.filter((approval) => (tab === "pending" ? approval.status === "pending" : true)),
    [approvals, tab],
  );

  const submit = async () => {
    if (!active) return;
    if (decision !== "approved" && !feedback.trim()) {
      toast.error("Feedback is required", "Explain what needs to change so the writer can act on it.");
      return;
    }
    setBusy(true);
    const res = await api("/api/v1/approvals", {
      method: "POST",
      json: { approvalId: active.id, decision, feedback: feedback.trim() || undefined },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const data = res.data as { postStatus?: string; allApproved?: boolean };
    setApprovals((prev) =>
      prev.map((item) =>
        item.id === active.id
          ? { ...item, status: decision === "changes_requested" ? "changes_requested" : decision, feedback, decided_at: new Date().toISOString() }
          : item,
      ),
    );
    toast.success(
      decision === "approved" ? "Stage approved" : "Changes requested",
      data.allApproved ? "Every stage is approved — the post can be scheduled." : "The post remains blocked until all stages are approved.",
    );
    setActive(null);
    setFeedback("");
  };

  return (
    <div className="space-y-3">
      <Banner tone="info" title="Approvals are enforced server-side">
        A post with any pending or rejected stage cannot be queued for publishing — the publishing engine re-checks the approval
        table before every delivery attempt.
      </Banner>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-0.5">
            {(["pending", "all"] as const).map((option) => (
              <button key={option} className="chip !border-0 !bg-transparent !py-1 capitalize" data-active={tab === option} onClick={() => setTab(option)}>
                {option === "pending" ? `Pending (${approvals.filter((a) => a.status === "pending").length})` : `All history (${approvals.length})`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--muted)]">Multi-stage: internal review → client approval</p>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Nothing to review" description="Submitted posts appear here with the stages configured on their client." icon={<ShieldCheck size={18} />} />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {visible.map((approval) => (
              <div key={approval.id} className={cn("p-3.5", approval.status === "pending" && "bg-[var(--brand-soft)]/30")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/content-studio?post=${approval.post_id}`} className="text-[13px] font-medium hover:underline">
                      {approval.post_title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {approval.client_name ?? "No client"} · {label(approval.stage)} ·{" "}
                      {approval.reviewer_name ? `reviewer ${approval.reviewer_name}` : "no reviewer assigned"} · due {formatDate(approval.due_at)}
                    </p>
                    {approval.caption && <p className="mt-1 line-clamp-2 max-w-2xl text-[11.5px] text-[var(--muted)]">{approval.caption}</p>}
                    {approval.feedback && (
                      <p className="mt-1.5 max-w-2xl rounded bg-[var(--card-2)] px-2 py-1 text-[11.5px]">
                        <span className="text-[var(--muted)]">Feedback:</span> {approval.feedback}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge status={approval.status} />
                    <div className="flex items-center gap-2 text-[10.5px] text-[var(--muted)]">
                      <PlatformDot platform={approval.platform} />
                      <span>{label(approval.content_type)}</span>
                    </div>
                    {approval.status === "pending" ? (
                      canApprove ? (
                        <div className="flex gap-1.5">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setActive(approval);
                              setDecision("approved");
                              setFeedback("");
                            }}
                          >
                            <CheckCircle2 size={11} /> Decide
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--muted)]">You cannot approve</span>
                      )
                    ) : (
                      <span className="text-[10px] text-[var(--muted)]">{formatDateTime(approval.decided_at)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Review “${active.post_title}”` : "Review"}
        description={active ? `${label(active.stage)} · ${active.client_name ?? "no client"}` : undefined}
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setActive(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
              {decision === "approved" ? "Approve stage" : decision === "rejected" ? "Reject post" : "Request changes"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {active?.caption && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-3 text-[12px] whitespace-pre-wrap">{active.caption}</div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ["approved", "Approve", CheckCircle2],
              ["changes_requested", "Request changes", MessageSquareWarning],
              ["rejected", "Reject", MessageSquareWarning],
            ] as const).map(([value, text, Icon]) => (
              <button
                key={value}
                className={cn("btn btn-sm justify-start", decision === value && "border-[var(--brand)] bg-[var(--brand-soft)]")}
                onClick={() => setDecision(value)}
              >
                <Icon size={12} /> {text}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Feedback {decision === "approved" ? "(optional)" : "(required)"}</label>
            <textarea className="textarea" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Be specific: what should change and why." />
          </div>
          <p className="text-[10.5px] text-[var(--muted)]">
            Decisions are recorded in content_approvals with your user id and timestamp, and create an audit log entry.
          </p>
        </div>
      </Modal>
    </div>
  );
}
