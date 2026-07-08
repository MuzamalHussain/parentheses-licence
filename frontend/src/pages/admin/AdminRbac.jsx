import { useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminRbac, useRbacAction } from "../../hooks/useLicenses";
import { useOrganizations } from "../../hooks/useAccount";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminRbac() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [permissions, setPermissions] = useState("products.read,licenses.read");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminRbac(activeOrgId);
  const action = useRbacAction();
  const selectedOrg = useMemo(() => organizations.find((org) => org._id === activeOrgId), [organizations, activeOrgId]);
  const teams = data?.teams || [];
  const roles = data?.roles || [];
  const members = data?.members || [];
  const matrix = data?.matrix || [];

  if (!activeOrgId && !isLoading) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold text-gray-900">RBAC</h1>
        <p className="text-sm text-gray-500 mt-1">Create or join an organization before managing teams and roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams & RBAC</h1>
          <p className="text-sm text-gray-500 mt-0.5">Permission matrix and enterprise access foundation</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Teams" value={teams.length} />
            <Metric label="Custom Roles" value={roles.length} />
            <Metric label="Members" value={members.length} />
            <Metric label="Permissions" value={data?.permissions?.length} />
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">{selectedOrg?.name || "Organization"} Access</h2>
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Create Team</p>
                <div className="flex gap-2">
                  <input className="input" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" />
                  <button
                    className="btn-primary"
                    disabled={!teamName || action.isPending}
                    onClick={() => action.mutate({ action: "create-team", organizationId: activeOrgId, body: { name: teamName } }, { onSuccess: () => setTeamName("") })}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Create Role</p>
                <div className="grid md:grid-cols-[1fr_1.4fr_auto] gap-2">
                  <input className="input" value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Role name" />
                  <input className="input font-mono" value={permissions} onChange={(event) => setPermissions(event.target.value)} />
                  <button
                    className="btn-primary"
                    disabled={!roleName || action.isPending}
                    onClick={() => action.mutate({
                      action: "create-role",
                      organizationId: activeOrgId,
                      body: { name: roleName, permissions: permissions.split(",").map((item) => item.trim()).filter(Boolean) },
                    }, { onSuccess: () => setRoleName("") })}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Teams</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {teams.map((team) => (
                  <div key={team._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{team.name}</p>
                      <p className="text-xs text-gray-500">{team.memberIds?.length || 0} members · {team.roleIds?.length || 0} roles</p>
                    </div>
                    <StatusBadge status={team.status} />
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Roles</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {roles.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No custom roles yet.</p>}
                {roles.map((role) => (
                  <div key={role._id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{role.name}</p>
                        <p className="text-xs text-gray-500">{role.permissions?.length || 0} permissions</p>
                      </div>
                      <StatusBadge status={role.status} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {(role.permissions || []).slice(0, 8).map((permission) => (
                        <span key={permission} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{permission}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Permission Matrix</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Resource</th>
                    {["read", "create", "update", "delete", "manage", "approve", "export"].map((actionName) => (
                      <th key={actionName} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{actionName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {matrix.map((row) => (
                    <tr key={row.resource}>
                      <td className="px-5 py-3 font-medium text-gray-900">{row.resource}</td>
                      {row.actions.map((permission) => (
                        <td key={permission} className="px-5 py-3 text-xs font-mono text-gray-500">{permission}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
