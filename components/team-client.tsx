"use client";

import { useState } from "react";
import { Mail, Plus, ShieldCheck, UserCog } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { Avatar, Badge, Banner, Card, EmptyState, Progress, SectionHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { formatDate, label, timeAgo } from "@/lib/utils";

type Member = {
  id: string;
  user_id: string | null;
  role_key: string;
  status: string;
  invited_email: string | null;
  client_scope: string | null;
  full_name: string | null;
  email: string | null;
  avatar_color: string | null;
  job_title: string | null;
  last_login_at: string | null;
  open_tasks: number;
  pending_reviews: number;
};

export function TeamClient({
  initialMembers,
  roles,
  clients,
  canManage,
}: {
  initialMembers: Member[];
  roles: { key: string; label: string }[];
  clients: { id: string; name: string }[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", fullName: "", roleKey: "content_writer", clientScope: "" });
  const [busy, setBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ note: string; linkedUser: boolean } | null>(null);

  const changeRole = async (memberId: string, roleKey: string) => {
    const res = await api("/api/v1/members", { method: "PATCH", json: { memberId, roleKey } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role_key: roleKey } : member)));
    toast.success("Role updated", "Permissions take effect immediately.");
  };

  const changeStatus = async (memberId: string, status: string) => {
    const res = await api("/api/v1/members", { method: "PATCH", json: { memberId, status } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, status } : member)));
    toast.success(`Member ${status}`);
  };

  const sendInvite = async () => {
    setBusy(true);
    const res = await api<{ note: string; linkedUser: boolean }>("/api/v1/members", {
      method: "POST",
      json: {
        email: invite.email,
        fullName: invite.fullName || undefined,
        roleKey: invite.roleKey,
        clientScope: invite.clientScope || null,
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, errorList(res.details).join(" · "));
      return;
    }
    setInviteResult(res.data);
    toast.success("Invitation recorded");
    setInvite({ email: "", fullName: "", roleKey: "content_writer", clientScope: "" });
  };

  const maxTasks = Math.max(...members.map((member) => member.open_tasks), 1);

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Members ({members.length})</p>
            <p className="text-[11.5px] text-[var(--muted)]">Nine roles, enforced server-side on every API route and page.</p>
          </div>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>
              <Plus size={12} /> Invite member
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>{["Member", "Role", "Status", "Brands", "Workload", "Reviews", "Last active", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={member.full_name ?? member.invited_email ?? "?"} color={member.avatar_color} size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium">{member.full_name ?? "Invitation pending"}</p>
                        <p className="truncate text-[10.5px] text-[var(--muted)]">{member.email ?? member.invited_email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canManage ? (
                      <select className="select h-7 w-auto text-[11px]" value={member.role_key} onChange={(e) => changeRole(member.id, e.target.value)}>
                        {roles.filter((role) => role.key !== "super_admin").map((role) => (
                          <option key={role.key} value={role.key}>{role.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge>{label(member.role_key)}</Badge>
                    )}
                  </td>
                  <td>
                    <Badge status={member.status === "active" ? "published" : member.status === "invited" ? "pending" : "failed"}>
                      {label(member.status)}
                    </Badge>
                  </td>
                  <td className="text-[11px] text-[var(--muted)]">
                    {member.client_scope
                      ? member.client_scope.split(",").map((id) => clients.find((c) => c.id === id)?.name ?? id).join(", ")
                      : "all clients"}
                  </td>
                  <td>
                    <div className="w-[90px]">
                      <Progress value={(member.open_tasks / maxTasks) * 100} />
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">{member.open_tasks} open</p>
                    </div>
                  </td>
                  <td className="text-[11px]">{member.pending_reviews}</td>
                  <td className="text-[10.5px] text-[var(--muted)]">{member.last_login_at ? timeAgo(member.last_login_at) : "never"}</td>
                  <td>
                    {canManage && member.status !== "active" && (
                      <button className="btn btn-sm" onClick={() => changeStatus(member.id, "active")}>Activate</button>
                    )}
                    {canManage && member.status === "active" && (
                      <button className="btn btn-sm btn-danger" onClick={() => changeStatus(member.id, "suspended")}>Suspend</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {members.length === 0 && <EmptyState title="No members" description="Invite your team to start assigning work." />}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Role permissions" description="Read this before changing a role — permissions are checked on the server." />
          <div className="mt-3 space-y-1.5">
            {roles.map((role) => (
              <div key={role.key} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[12px]"><ShieldCheck size={12} className="text-[var(--accent)]" /> {role.label}</span>
                <span className="text-[10.5px] text-[var(--muted)]">
                  {role.key === "super_admin" ? "full platform" : role.key === "client_viewer" ? "scoped read-only" : "workspace scoped"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Workload" description="Open tasks and pending reviews per member." />
          <div className="mt-3 space-y-2">
            {members.map((member) => (
              <div key={member.id}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span>{member.full_name ?? member.invited_email}</span>
                  <span className="text-[var(--muted)]">{member.open_tasks} tasks · {member.pending_reviews} reviews</span>
                </div>
                <div className="mt-1"><Progress value={(member.open_tasks / maxTasks) * 100} /></div>
              </div>
            ))}
          </div>
          <Banner tone="info" title="Invitations">
            This deployment sends no email unless SMTP_URL is configured. Invitations are stored in workspace_members with an
            invited status; the person must register with the same email to be linked.
          </Banner>
        </Card>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteResult(null);
        }}
        title="Invite a team member"
        description="Assign a role and optionally restrict them to specific clients."
        footer={
          <>
            <button className="btn btn-sm" onClick={() => setInviteOpen(false)}>Close</button>
            <button className="btn btn-primary btn-sm" onClick={sendInvite} disabled={busy || !invite.email}>
              <Mail size={12} /> Record invitation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="person@agency.com" />
          </div>
          <div>
            <label className="label">Full name (optional)</label>
            <input className="input" value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="select" value={invite.roleKey} onChange={(e) => setInvite({ ...invite, roleKey: e.target.value })}>
                {roles.filter((role) => role.key !== "super_admin").map((role) => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Client scope</label>
              <select className="select" value={invite.clientScope} onChange={(e) => setInvite({ ...invite, clientScope: e.target.value })}>
                <option value="">All clients</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </div>
          </div>
          {inviteResult && (
            <Banner tone={inviteResult.linkedUser ? "success" : "warning"} title={inviteResult.linkedUser ? "Member linked" : "Invitation pending"}>
              {inviteResult.note}
            </Banner>
          )}
          <p className="text-[10.5px] text-[var(--muted)]">
            <UserCog size={10} className="inline" /> Roles can be changed later; client viewers only ever see their scoped clients' rows.
          </p>
        </div>
      </Modal>
    </div>
  );
}
