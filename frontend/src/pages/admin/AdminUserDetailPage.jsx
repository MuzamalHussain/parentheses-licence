import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Key,
  Loader2,
  Lock,
  Mail,
  NotebookPen,
  Package,
  Power,
  PowerOff,
  RotateCcw,
  Save,
  ShieldCheck,
  ShieldOff,
  ShoppingCart,
  Ticket,
  User,
} from "lucide-react";
import { Alert, Button } from "../../components/ui";
import Pagination from "../../components/ui/Pagination";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  useAdminUserAudit,
  useAdminUserDomains,
  useAdminUserDownloads,
  useAdminUserLicenses,
  useAdminUserOrders,
  useAdminUserOverview,
  useAdminUserSecurity,
  useAdminUserSupport,
  useAddAdminUserNote,
  useForceAdminUserPasswordReset,
  useRevokeAdminUserSessions,
  useRevokeAdminUserSession,
  useSendAdminUserPasswordReset,
  useUpdateAdminUserEmailVerification,
  useUpdateAdminUserProfile,
  useUpdateAdminUserStatus,
} from "../../hooks/useUsers";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "licenses", label: "Licenses" },
  { id: "orders", label: "Orders" },
  { id: "downloads", label: "Downloads" },
  { id: "domains", label: "Domains" },
  { id: "support", label: "Support" },
  { id: "security", label: "Security" },
  { id: "activity", label: "Activity" },
];

function formatDate(value, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function formatMoney(order) {
  if (!order?.amount && order?.amount !== 0) return "-";
  const symbol = order.currency === "USD" ? "$" : "Rs ";
  return `${symbol}${Number(order.amount).toLocaleString()}`;
}

function formatLabel(value) {
  if (!value) return "-";
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function EmptyState({ icon: Icon, title }) {
  return (
    <div className="card p-10 text-center">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );
}

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    yellow: "bg-yellow-50 text-yellow-700",
    purple: "bg-purple-50 text-purple-700",
    brand: "bg-brand-50 text-brand-700",
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

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-4">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-1 break-words">{value || "-"}</p>
    </div>
  );
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

function DataShell({ query, emptyIcon, emptyTitle, children }) {
  if (query.isLoading) return <LoadingState />;
  if (query.error) {
    return <Alert type="error" message={query.error.response?.data?.message || "Failed to load this section."} />;
  }
  const rows = query.data?.data || [];
  if (rows.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} />;
  return children(rows, query.data?.pagination || {});
}

function CustomerManagementPanel({ customer, onOpenTab }) {
  const [profile, setProfile] = useState({ name: customer.name || "", companyName: customer.companyName || "" });
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(null);
  const updateProfile = useUpdateAdminUserProfile(customer.id);
  const updateStatus = useUpdateAdminUserStatus(customer.id);
  const updateEmail = useUpdateAdminUserEmailVerification(customer.id);
  const forceReset = useForceAdminUserPasswordReset(customer.id);
  const sendReset = useSendAdminUserPasswordReset(customer.id);
  const revokeSessions = useRevokeAdminUserSessions(customer.id);
  const addNote = useAddAdminUserNote(customer.id);

  useEffect(() => {
    setProfile({ name: customer.name || "", companyName: customer.companyName || "" });
  }, [customer.name, customer.companyName]);

  const submitProfile = (event) => {
    event.preventDefault();
    updateProfile.mutate(profile);
  };

  const confirmAction = (next) => setConfirm(next);
  const runConfirmed = () => {
    if (!confirm) return;
    confirm.run();
  };
  const closeConfirm = () => setConfirm(null);
  const actionSettled = () => setConfirm(null);

  const addInternalNote = (event) => {
    event.preventDefault();
    if (!note.trim()) return;
    addNote.mutate(note.trim(), { onSuccess: () => setNote("") });
  };

  const notes = customer.internalNotes || [];
  const busy = updateStatus.isPending || forceReset.isPending || revokeSessions.isPending;

  return (
    <>
      {confirm && (
        <ConfirmModal
          {...confirm}
          loading={busy}
          onConfirm={runConfirmed}
          onClose={closeConfirm}
        />
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-gray-900">Customer information</h2>
              <Badge tone="gray">Email locked</Badge>
            </div>
            <form onSubmit={submitProfile} className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={profile.name}
                  onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">Company</label>
                <input
                  className="input"
                  value={profile.companyName}
                  onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))}
                />
              </div>
              <Button type="submit" loading={updateProfile.isPending}>
                <Save className="w-4 h-4" /> Save
              </Button>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Account status</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={customer.isActive && !customer.isSuspended}
                onClick={() => updateStatus.mutate("activate")}
              >
                <Power className="w-4 h-4" /> Activate
              </Button>
              <Button
                variant="secondary"
                disabled={!customer.isActive}
                onClick={() => confirmAction({
                  title: "Deactivate customer?",
                  message: "The customer will not be able to sign in. Active sessions will be revoked.",
                  confirmLabel: "Deactivate",
                  confirmClass: "bg-red-600 text-white hover:bg-red-700",
                  run: () => updateStatus.mutate("deactivate", { onSettled: actionSettled }),
                })}
              >
                <PowerOff className="w-4 h-4" /> Deactivate
              </Button>
              <Button
                variant="secondary"
                disabled={customer.isSuspended}
                onClick={() => confirmAction({
                  title: "Suspend customer?",
                  message: "The customer will be blocked immediately and active sessions will be revoked.",
                  confirmLabel: "Suspend",
                  confirmClass: "bg-yellow-500 text-white hover:bg-yellow-600",
                  run: () => updateStatus.mutate("suspend", { onSettled: actionSettled }),
                })}
              >
                <ShieldOff className="w-4 h-4" /> Suspend
              </Button>
              <Button
                variant="secondary"
                disabled={!customer.isSuspended}
                onClick={() => updateStatus.mutate("unsuspend")}
              >
                <ShieldCheck className="w-4 h-4" /> Unsuspend
              </Button>
              <Button
                variant="secondary"
                onClick={() => updateEmail.mutate(!customer.emailVerified)}
              >
                <Mail className="w-4 h-4" /> {customer.emailVerified ? "Unverify Email" : "Verify Email"}
              </Button>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Security</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => confirmAction({
                  title: "Force password reset?",
                  message: "A reset token will be generated, a reset email will be queued, and all active sessions will be revoked.",
                  confirmLabel: "Force Reset",
                  confirmClass: "bg-red-600 text-white hover:bg-red-700",
                  run: () => forceReset.mutate(undefined, { onSettled: actionSettled }),
                })}
              >
                <RotateCcw className="w-4 h-4" /> Force Password Reset
              </Button>
              <Button variant="secondary" loading={sendReset.isPending} onClick={() => sendReset.mutate()}>
                <Mail className="w-4 h-4" /> Send Reset Email
              </Button>
              <Button
                variant="secondary"
                onClick={() => confirmAction({
                  title: "Revoke active sessions?",
                  message: "All current refresh sessions for this customer will be invalidated.",
                  confirmLabel: "Revoke",
                  confirmClass: "bg-red-600 text-white hover:bg-red-700",
                  run: () => revokeSessions.mutate(undefined, { onSettled: actionSettled }),
                })}
              >
                <ShieldOff className="w-4 h-4" /> Revoke Sessions
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-3">Last login: {formatDate(customer.lastLoginAt, true)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Internal notes</h2>
            <form onSubmit={addInternalNote} className="space-y-3">
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Add an internal note..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button type="submit" loading={addNote.isPending} className="w-full">
                <NotebookPen className="w-4 h-4" /> Add Note
              </Button>
            </form>
            <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400">No internal notes yet.</p>
              ) : (
                notes.map((item) => (
                  <div key={item.id || item.createdAt} className="rounded-lg border border-gray-100 p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.body}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {item.createdBy?.name || "Admin"} - {formatDate(item.createdAt, true)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onOpenTab("licenses")} className="btn-secondary justify-center"><Key className="w-4 h-4" /> License</button>
              <button onClick={() => onOpenTab("orders")} className="btn-secondary justify-center"><ShoppingCart className="w-4 h-4" /> Order</button>
              <button onClick={() => onOpenTab("support")} className="btn-secondary justify-center"><Ticket className="w-4 h-4" /> Support</button>
              <button onClick={() => onOpenTab("downloads")} className="btn-secondary justify-center"><Download className="w-4 h-4" /> Download</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OverviewTab({ overview }) {
  const customer = overview.customer;
  const counts = overview.counts;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Customer information</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <DetailItem label="Name" value={customer.name} />
          <DetailItem label="Email" value={customer.email} />
          <DetailItem label="Company" value={customer.companyName} />
          <DetailItem label="Role" value={customer.role} />
          <DetailItem label="Registered" value={formatDate(customer.createdAt, true)} />
          <DetailItem label="Last login" value={formatDate(customer.lastLoginAt, true)} />
        </div>
      </div>
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Account summary</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <DetailItem label="Account status" value={formatLabel(customer.accountStatus || (customer.isActive ? "active" : "inactive"))} />
          <DetailItem label="Email verification" value={customer.emailVerified ? "Verified" : "Unverified"} />
          <DetailItem label="Verified at" value={formatDate(customer.emailVerifiedAt, true)} />
          <DetailItem label="Verification source" value={customer.emailVerificationSource === "manual_admin" ? "Manual Admin Verification" : customer.emailVerificationSource === "email" ? "Email Verification" : customer.emailVerificationSource === "api" ? "API" : "-"} />
          <DetailItem label="Active licenses" value={counts.licenses?.active || 0} />
          <DetailItem label="Open tickets" value={counts.supportTickets?.open || 0} />
          <DetailItem label="Audit events" value={counts.auditEvents?.total || 0} />
          <DetailItem label="Two-factor auth" value={customer.twoFactorEnabled ? "Enabled" : "Disabled"} />
        </div>
      </div>
    </div>
  );
}

function LicensesTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserLicenses(customerId, { page, limit: 10 });
  return (
    <DataShell query={query} emptyIcon={Key} emptyTitle="No licenses found for this customer.">
      {(licenses, pagination) => (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">License Key</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Expiry</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Activations</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {licenses.map((license) => (
                  <tr key={license._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{license.licenseKey}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{license.productId?.name || "-"}</p>
                      <p className="text-xs text-gray-400">{license.planId?.name || "-"}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={license.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">{formatDate(license.expiresAt)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                      {(license.activeDomains?.length || 0)}/{license.allowedSites === 0 ? "unlimited" : license.allowedSites}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/admin/licenses" title="Open licenses" className="inline-flex p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50">
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination {...pagination} onPage={setPage} /></div>
        </div>
      )}
    </DataShell>
  );
}

function OrdersTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserOrders(customerId, { page, limit: 10 });
  return (
    <DataShell query={query} emptyIcon={ShoppingCart} emptyTitle="No orders found for this customer.">
      {(orders, pagination) => (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => (
                  <tr key={order._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{order._id}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-xs">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{formatMoney(order)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                      {order.productId?.name || "-"} {order.planId?.name ? `- ${order.planId.name}` : ""}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination {...pagination} onPage={setPage} /></div>
        </div>
      )}
    </DataShell>
  );
}

function DownloadsTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserDownloads(customerId, { page, limit: 10 });
  return (
    <DataShell query={query} emptyIcon={Download} emptyTitle="No downloads found for this customer.">
      {(downloads, pagination) => (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Downloaded At</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {downloads.map((download) => (
                  <tr key={download._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{download.licenseId?.licenseKey || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{download.pluginVersionId?.versionNumber || "-"}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-xs">{formatDate(download.createdAt, true)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{download.ipAddress || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination {...pagination} onPage={setPage} /></div>
        </div>
      )}
    </DataShell>
  );
}

function DomainsTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserDomains(customerId, { page, limit: 10 });
  return (
    <DataShell query={query} emptyIcon={Globe} emptyTitle="No activated domains found for this customer.">
      {(domains, pagination) => (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">License</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Activated</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {domains.map((domain, index) => (
                  <tr key={`${domain.license?.id}-${domain.domain}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-800">{domain.domain}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-gray-600">{domain.license?.licenseKey || "-"}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-xs">{formatDate(domain.activatedAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={domain.currentStatus || domain.license?.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination {...pagination} onPage={setPage} /></div>
        </div>
      )}
    </DataShell>
  );
}

function SupportTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserSupport(customerId, { page, limit: 10 });
  return (
    <DataShell query={query} emptyIcon={Ticket} emptyTitle="No support tickets found for this customer.">
      {(tickets, pagination) => (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Ticket</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tickets.map((ticket) => (
                  <tr key={ticket._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-gray-800 font-medium">{ticket.subject}</p>
                      <p className="text-xs text-gray-400">{formatDate(ticket.lastMessageAt, true)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{ticket.priority || "-"}</td>
                    <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600">{ticket.assignedAgentId?.name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination {...pagination} onPage={setPage} /></div>
        </div>
      )}
    </DataShell>
  );
}

function SecurityTab({ customerId }) {
  const query = useAdminUserSecurity(customerId);
  const revokeSession = useRevokeAdminUserSession(customerId);

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <Alert type="error" message="Failed to load security details." />;

  const sessions = query.data?.sessions || [];
  const loginHistory = query.data?.loginHistory || [];
  const securityEvents = query.data?.securityEvents || [];
  const failedLogin = query.data?.failedLogin || {};

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard label="Active Sessions" value={sessions.length} icon={ShieldCheck} color="text-green-600 bg-green-50" />
        <StatCard label="Failed Attempts" value={failedLogin.attemptCount || 0} icon={ShieldOff} color="text-red-600 bg-red-50" />
        <div className="card p-4">
          <div className="inline-flex p-2 rounded-lg text-yellow-600 bg-yellow-50 mb-3">
            <Lock className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-gray-900">{failedLogin.lockedUntil ? formatDate(failedLogin.lockedUntil, true) : "Not locked"}</p>
          <p className="text-xs text-gray-500 mt-0.5">Lock status</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Current Sessions</h2>
        </div>
        {sessions.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">No active sessions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">IP</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Login</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Last Activity</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((session) => (
                  <tr key={session.sessionId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{session.browser} on {session.operatingSystem}</p>
                      <p className="text-xs text-gray-400">{session.device}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-gray-500">{session.ipAddress || "-"}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">{formatDate(session.loginAt, true)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">{formatDate(session.lastActivity, true)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        title="Terminate session"
                        disabled={revokeSession.isPending}
                        onClick={() => revokeSession.mutate(session.sessionId)}
                        className="inline-flex p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                      >
                        <ShieldOff className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Login History</h2>
          {loginHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No login history.</p>
          ) : (
            <div className="space-y-3">
              {loginHistory.map((event) => (
                <div key={event._id} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${event.action === "auth.login_failed" ? "bg-red-500" : "bg-green-500"}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{event.action}</p>
                    <p className="text-xs text-gray-400">{formatDate(event.createdAt, true)} - {event.ipAddress || event.metadata?.ipAddress || "no ip"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Security Events</h2>
          {securityEvents.length === 0 ? (
            <p className="text-sm text-gray-400">No security events.</p>
          ) : (
            <div className="space-y-3">
              {securityEvents.slice(0, 20).map((event) => (
                <div key={event._id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{event.action}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(event.createdAt, true)} - {event.actorId?.email || event.actorEmail || "system"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useAdminUserAudit(customerId, { page, limit: 20 });
  const grouped = useMemo(() => {
    const logs = query.data?.data || [];
    return logs.reduce((acc, log) => {
      const key = formatDate(log.createdAt);
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {});
  }, [query.data?.data]);

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <Alert type="error" message="Failed to load activity timeline." />;
  if (!query.data?.data?.length) return <EmptyState icon={FileText} title="No activity found for this customer." />;

  return (
    <div className="card p-5">
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, logs]) => (
          <div key={date}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">{date}</p>
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log._id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{log.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(log.createdAt, true)} - {log.actorId?.email || log.actorRole || "system"} - {log.targetType || "Activity"}
                    </p>
                    {log.ipAddress && <p className="text-xs text-gray-400 mt-0.5 font-mono">{log.ipAddress}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Pagination {...(query.data?.pagination || {})} onPage={setPage} />
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("overview");
  const overviewQuery = useAdminUserOverview(id);

  if (overviewQuery.isLoading) return <LoadingState />;
  if (overviewQuery.error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back to customers
        </Link>
        <Alert type="error" message={overviewQuery.error.response?.data?.message || "Failed to load customer."} />
      </div>
    );
  }

  const overview = overviewQuery.data;
  const customer = overview.customer;
  const counts = overview.counts || {};

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Back to customers
      </Link>

      <div className="card p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{customer.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {customer.email}</span>
                {customer.companyName && <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {customer.companyName}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge tone={roleTone(customer.role)}>{customer.role}</Badge>
                <Badge tone={customer.isSuspended ? "yellow" : customer.isActive ? "green" : "red"}>
                  {formatLabel(customer.accountStatus || (customer.isActive ? "active" : "inactive"))}
                </Badge>
                <Badge tone={customer.emailVerified ? "green" : "yellow"}>{customer.emailVerified ? "Verified" : "Unverified"}</Badge>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-500 lg:text-right">
            <span className="inline-flex lg:justify-end items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Registered {formatDate(customer.createdAt)}</span>
            <span className="inline-flex lg:justify-end items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Last login {formatDate(customer.lastLoginAt)}</span>
            <div className="sm:col-span-2 flex flex-wrap gap-2 lg:justify-end">
              <button onClick={() => setActiveTab("licenses")} className="btn-secondary"><Key className="w-4 h-4" /> Licenses</button>
              <button onClick={() => setActiveTab("orders")} className="btn-secondary"><ShoppingCart className="w-4 h-4" /> Orders</button>
              <button onClick={() => setActiveTab("support")} className="btn-secondary"><Ticket className="w-4 h-4" /> Support</button>
            </div>
          </div>
        </div>
      </div>

      <CustomerManagementPanel customer={customer} onOpenTab={setActiveTab} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Total Licenses" value={counts.licenses?.total} icon={Key} color="text-brand-600 bg-brand-50" />
        <StatCard label="Active Licenses" value={counts.licenses?.active || 0} icon={ShieldCheck} color="text-green-600 bg-green-50" />
        <StatCard label="Orders" value={counts.orders?.total} icon={ShoppingCart} color="text-purple-600 bg-purple-50" />
        <StatCard label="Downloads" value={counts.downloads?.total} icon={Download} color="text-blue-600 bg-blue-50" />
        <StatCard label="Domains" value={counts.activeDomains?.total} icon={Globe} color="text-orange-600 bg-orange-50" />
        <StatCard label="Support Tickets" value={counts.supportTickets?.total} icon={Ticket} color="text-yellow-600 bg-yellow-50" />
      </div>

      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && <OverviewTab overview={overview} />}
      {activeTab === "licenses" && <LicensesTab customerId={id} />}
      {activeTab === "orders" && <OrdersTab customerId={id} />}
      {activeTab === "downloads" && <DownloadsTab customerId={id} />}
      {activeTab === "domains" && <DomainsTab customerId={id} />}
      {activeTab === "support" && <SupportTab customerId={id} />}
      {activeTab === "security" && <SecurityTab customerId={id} />}
      {activeTab === "activity" && <ActivityTab customerId={id} />}
    </div>
  );
}
