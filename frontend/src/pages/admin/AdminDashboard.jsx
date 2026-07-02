import { Users, Key, Package, AlertTriangle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminDashboard } from "../../hooks/useLicenses";
import StatusBadge from "../../components/ui/StatusBadge";

function StatCard({ label, value, sub, icon: Icon, color, to }) {
  const inner = (
    <div className="card p-5 hover:shadow-md transition-shadow group">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? "—"}</p>
      <p className="text-sm text-gray-500 mt-0.5 group-hover:text-brand-600 transition-colors">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function RecentLicenseRow({ license }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-mono font-medium text-gray-800">{license.licenseKey}</p>
        <p className="text-xs text-gray-400 truncate">
          {license.userId?.name} · {license.productId?.name}
        </p>
      </div>
      <StatusBadge status={license.status} className="ml-3 flex-shrink-0" />
    </div>
  );
}

function AuditRow({ log }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-gray-700">
          <span className="font-medium">{log.actorEmail || "System"}</span>{" "}
          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{log.action}</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(log.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useAdminDashboard();

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );

  const d = data || {};
  const lic = d.licenses || {};
  const cust = d.customers || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={cust.total}
          sub={`+${cust.newLast30Days ?? 0} this month`}
          icon={Users} color="text-blue-600 bg-blue-50" to="/admin/users" />
        <StatCard label="Active Licenses" value={lic.active}
          icon={Key} color="text-green-600 bg-green-50" to="/admin/licenses" />
        <StatCard label="Suspended" value={lic.suspended}
          icon={AlertTriangle} color="text-yellow-600 bg-yellow-50" to="/admin/licenses?status=suspended" />
        <StatCard label="Total Licenses" value={lic.total}
          icon={Package} color="text-purple-600 bg-purple-50" to="/admin/licenses" />
      </div>

      {/* Two-column lower section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent licenses */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Licenses</h2>
            <Link to="/admin/licenses" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {d.recentLicenses?.length ? (
            d.recentLicenses.map((l) => <RecentLicenseRow key={l._id} license={l} />)
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No licenses yet.</p>
          )}
        </div>

        {/* Audit log */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            <Link to="/admin/audit" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {d.recentAuditLogs?.length ? (
            d.recentAuditLogs.map((l) => <AuditRow key={l._id} log={l} />)
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
