import { useMemo, useState } from "react";
import { Building2, Loader2, Plus, RefreshCw, Send, Users } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizationAction, useOrganizationDashboard, useOrganizations } from "../../hooks/useAccount";
import { useAuth } from "../../context/AuthContext";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function OrganizationsPage() {
  const { user } = useAuth();
  const { data: organizations = [], isLoading } = useOrganizations();
  const [selectedId, setSelectedId] = useState(user?.activeOrganizationId || "");
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const action = useOrganizationAction();
  const activeId = selectedId || organizations[0]?._id || "";
  const selected = useMemo(() => organizations.find((org) => org._id === activeId), [organizations, activeId]);
  const dashboard = useOrganizationDashboard(activeId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const summary = dashboard.data?.summary || {};
  const members = dashboard.data?.members || [];
  const invitations = dashboard.data?.invitations || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage teams, invitations, and organization context.</p>
      </div>

      <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-6">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Create Organization</h2>
            </div>
            <div className="space-y-3">
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Organization name" />
              <button
                className="btn-primary"
                disabled={!name || action.isPending}
                onClick={() => action.mutate({ action: "create", body: { name } }, { onSuccess: () => setName("") })}
              >
                {action.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Your Organizations</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {organizations.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No organizations yet.</p>}
              {organizations.map((org) => (
                <button
                  key={org._id}
                  type="button"
                  onClick={() => setSelectedId(org._id)}
                  className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${activeId === org._id ? "bg-brand-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{org.name}</p>
                      <p className="text-xs text-gray-500">{org.slug} · {org.membershipRole}</p>
                    </div>
                    <StatusBadge status={org.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Metric label="Members" value={summary.members} />
            <Metric label="Invites" value={summary.pendingInvitations} />
            <Metric label="Licenses" value={summary.licenses} />
            <Metric label="Orders" value={summary.orders} />
            <Metric label="Domains" value={summary.domains} />
          </div>

          {selected && (
            <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{selected.name}</p>
                <p className="text-sm text-gray-500">{selected.website || "No website"} · {selected.billingEmail || "No billing email"}</p>
              </div>
              <button
                className="btn-secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ action: "switch", organizationId: selected._id })}
              >
                <RefreshCw className="w-4 h-4" /> Switch
              </button>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Invite Member</h2>
            </div>
            <div className="grid md:grid-cols-[1fr_160px_auto] gap-3">
              <input className="input" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="member@example.com" />
              <select className="input" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                {["admin", "manager", "developer", "support", "finance", "viewer"].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button
                className="btn-primary"
                disabled={!activeId || !inviteEmail || action.isPending}
                onClick={() => action.mutate({ action: "invite", organizationId: activeId, body: { email: inviteEmail, role: inviteRole } }, { onSuccess: () => setInviteEmail("") })}
              >
                Invite
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Members</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {members.map((member) => (
                <div key={member._id} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{member.userId?.name || "Member"}</p>
                    <p className="text-xs text-gray-500">{member.userId?.email || member.userId} · {member.role}</p>
                  </div>
                  <StatusBadge status={member.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Pending Invitations</h2>
            <div className="space-y-2">
              {invitations.length === 0 && <p className="text-sm text-gray-500">No pending invitations.</p>}
              {invitations.map((invite) => (
                <div key={invite._id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700">{invite.email} · {invite.role}</span>
                  <StatusBadge status={invite.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
