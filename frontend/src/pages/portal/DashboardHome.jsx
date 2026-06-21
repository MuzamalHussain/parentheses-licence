import { Key, Globe, AlertCircle, ShoppingCart, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMyLicenseSummary, useMyLicenses } from "../../hooks/useLicenses";
import StatusBadge from "../../components/ui/StatusBadge";

function StatCard({ label, value, icon: Icon, color, to, sub }) {
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

export default function DashboardHome() {
  const { user } = useAuth();
  const { data: summary, isLoading: sumLoading } = useMyLicenseSummary();
  const { data: licData, isLoading: licLoading }  = useMyLicenses({ limit: 5 });

  const licenses = licData?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here's your Parentheses account overview.</p>
      </div>

      {/* Stat cards */}
      {sumLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="w-9 h-9 bg-gray-100 rounded-lg mb-3" />
              <div className="h-7 bg-gray-100 rounded w-1/2 mb-1" />
              <div className="h-4 bg-gray-50 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Licenses" value={summary?.activeLicenses}
            icon={Key} color="text-brand-600 bg-brand-50" to="/dashboard/licenses" />
          <StatCard label="Total Licenses" value={summary?.totalLicenses}
            icon={ShoppingCart} color="text-purple-600 bg-purple-50" to="/dashboard/licenses" />
          <StatCard label="Active Domains" value={summary?.activeDomains}
            icon={Globe} color="text-green-600 bg-green-50" to="/dashboard/licenses" />
          <StatCard label="Expiring Soon" value={summary?.expiringInDays30}
            sub="within 30 days"
            icon={AlertCircle} color="text-orange-600 bg-orange-50"
            to="/dashboard/licenses?status=active" />
        </div>
      )}

      {/* Recent licenses */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Your Licenses</h2>
          <Link to="/dashboard/licenses" className="text-sm text-brand-600 hover:underline">View all</Link>
        </div>

        {licLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : licenses.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Key className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No licenses yet.</p>
            <p className="text-xs mt-1">Purchase a plugin to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {licenses.map((l) => {
              const exp = l.expiresAt ? new Date(l.expiresAt) : null;
              const isExpired = exp && exp < new Date();
              return (
                <Link key={l._id} to={`/dashboard/licenses`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-gray-800 tracking-wide">
                      {l.licenseKey}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {l.productId?.name} · {l.planId?.name} ·{" "}
                      {l.activeDomains?.length ?? 0}/{l.allowedSites === 0 ? "∞" : l.allowedSites} sites
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    {exp && (
                      <span className={`text-xs hidden sm:block ${isExpired ? "text-red-500" : "text-gray-400"}`}>
                        {isExpired ? "Expired" : `Expires ${exp.toLocaleDateString()}`}
                      </span>
                    )}
                    {!exp && <span className="text-xs text-gray-400 hidden sm:block">Lifetime</span>}
                    <StatusBadge status={l.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
