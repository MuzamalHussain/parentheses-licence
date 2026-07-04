import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, Loader2, Search, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { Alert, Button, Input } from "../../components/ui";
import Pagination from "../../components/ui/Pagination";
import { useAdminUsers, useToggleUserActive, useUpdateUserRole } from "../../hooks/useUsers";

const roleOptions = ["customer", "admin", "support"];

function getUserId(user) {
  return user?.id || user?._id;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    brand: "bg-brand-50 text-brand-700",
    green: "bg-green-50 text-green-700",
    yellow: "bg-yellow-50 text-yellow-700",
    red: "bg-red-50 text-red-700",
    purple: "bg-purple-50 text-purple-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function roleTone(role) {
  if (role === "admin") return "red";
  if (role === "support") return "purple";
  return "brand";
}

function ConfirmModal({ title, message, confirmLabel, confirmClass = "btn-primary", loading, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{message}</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-60 ${confirmClass}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ account, currentUserId, onRoleChange, onToggleActive }) {
  const id = getUserId(account);
  const isSelf = id && currentUserId && id.toString() === currentUserId.toString();

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 min-w-[220px]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{account.name}</p>
            <p className="text-xs text-gray-400 truncate">{account.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-sm text-gray-600">
        {account.companyName || "-"}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <Badge tone={roleTone(account.role)}>{account.role}</Badge>
          <select
            className="input max-w-[130px] py-1 text-xs"
            value={account.role}
            disabled={isSelf}
            title={isSelf ? "You cannot change your own role." : "Change role"}
            onChange={(e) => onRoleChange(account, e.target.value)}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Badge tone={account.isActive ? "green" : "red"}>
            {account.isActive ? "Active" : "Inactive"}
          </Badge>
          <Badge tone={account.emailVerified ? "green" : "yellow"}>
            {account.emailVerified ? "Verified" : "Unverified"}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
        {formatDate(account.lastLoginAt)}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">
        {formatDate(account.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            title="Customer detail arrives in Phase 9F"
            onClick={() => toast("Customer detail arrives in Phase 9F.")}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            title={isSelf ? "You cannot deactivate yourself." : account.isActive ? "Deactivate user" : "Activate user"}
            disabled={isSelf}
            onClick={() => onToggleActive(account)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {account.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [confirm, setConfirm] = useState(null);

  const { data, isLoading, error } = useAdminUsers({
    page,
    limit: 15,
    search: search || undefined,
    role: role || undefined,
  });
  const updateRole = useUpdateUserRole();
  const toggleActive = useToggleUserActive();

  const users = useMemo(() => data?.data || [], [data?.data]);
  const pagination = data?.pagination || {};
  const hasFilters = Boolean(search || role || activeFilter || verifiedFilter);
  const currentUserId = user?.id || user?._id;

  const visibleUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((account) => {
      if (activeFilter === "active" && !account.isActive) return false;
      if (activeFilter === "inactive" && account.isActive) return false;
      if (verifiedFilter === "verified" && !account.emailVerified) return false;
      if (verifiedFilter === "unverified" && account.emailVerified) return false;
      if (normalizedSearch && account.companyName?.toLowerCase().includes(normalizedSearch)) return true;
      return true;
    });
  }, [users, activeFilter, verifiedFilter, search]);

  const clearFilters = () => {
    setSearch("");
    setRole("");
    setActiveFilter("");
    setVerifiedFilter("");
    setPage(1);
  };

  const handleRoleChange = (account, nextRole) => {
    if (nextRole === account.role) return;
    setConfirm({
      type: "role",
      account,
      nextRole,
      title: "Change user role?",
      message: `Change ${account.email} from ${account.role} to ${nextRole}?`,
      confirmLabel: "Change role",
      confirmClass: "bg-brand-600 text-white hover:bg-brand-700",
    });
  };

  const handleToggleActive = (account) => {
    setConfirm({
      type: "active",
      account,
      title: account.isActive ? "Deactivate user?" : "Activate user?",
      message: account.isActive
        ? `${account.email} will no longer be able to sign in.`
        : `${account.email} will be able to sign in again.`,
      confirmLabel: account.isActive ? "Deactivate" : "Activate",
      confirmClass: account.isActive
        ? "bg-red-600 text-white hover:bg-red-700"
        : "bg-green-600 text-white hover:bg-green-700",
    });
  };

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.type === "role") {
      updateRole.mutate(
        { id: getUserId(confirm.account), role: confirm.nextRole },
        { onSettled: () => setConfirm(null) }
      );
    }
    if (confirm.type === "active") {
      toggleActive.mutate(getUserId(confirm.account), { onSettled: () => setConfirm(null) });
    }
  };

  return (
    <>
      {confirm && (
        <ConfirmModal
          {...confirm}
          loading={updateRole.isPending || toggleActive.isPending}
          onConfirm={confirmAction}
          onClose={() => setConfirm(null)}
        />
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage portal users, roles, and account access.</p>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search name, email, or company..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>

            <select className="input lg:w-40" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
              <option value="support">Support</option>
            </select>

            <select className="input lg:w-40" value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select className="input lg:w-44" value={verifiedFilter} onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }}>
              <option value="">All verification</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>

            {hasFilters && (
              <Button variant="secondary" onClick={clearFilters}>
                <X className="w-4 h-4" /> Clear
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>Role and name/email search use backend filters. Company, active, and verification filters are applied to the current page until backend filters are added.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : error ? (
          <Alert type="error" message={error.response?.data?.message || "Failed to load users."} />
        ) : users.length === 0 ? (
          <div className="card p-12 text-center">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">{hasFilters ? "No matching users found" : "No users found"}</p>
            <p className="text-sm text-gray-400 mt-1">
              {hasFilters ? "Try clearing or changing your filters." : "Registered users will appear here."}
            </p>
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="card p-12 text-center">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No users match the current page filters</p>
            <p className="text-sm text-gray-400 mt-1">Try another page or clear active/verification filters.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Company</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Last Login</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleUsers.map((account) => (
                    <UserRow
                      key={getUserId(account)}
                      account={account}
                      currentUserId={currentUserId}
                      onRoleChange={handleRoleChange}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <Pagination {...pagination} onPage={setPage} />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-gray-400">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>Self-protection is enforced in the UI for role changes and deactivation, and the backend also rejects those actions.</p>
        </div>
      </div>
    </>
  );
}
