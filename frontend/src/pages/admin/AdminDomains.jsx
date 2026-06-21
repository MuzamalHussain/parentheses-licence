import { useState } from "react";
import { Globe, Search, Loader2, X, Trash2, Clock, User, Package, ExternalLink } from "lucide-react";
import { Input, Button, Alert } from "../../components/ui";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import { useAdminDomains, useAdminDomainStats, useDomainHistory, useForceDeactivateDomain } from "../../hooks/useDomains";

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-5">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? "—"}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function HistoryDrawer({ licenseId, licenseKey, onClose }) {
  const { data: history, isLoading } = useDomainHistory(licenseId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Activation History</h2>
            <p className="text-xs font-mono text-gray-400">{licenseKey}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : !history?.length ? (
            <p className="text-sm text-gray-400 text-center py-10">No activation events yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((event) => (
                <div key={event._id} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    event.action === "activate" ? "bg-green-500" : "bg-red-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className={`font-medium ${event.action === "activate" ? "text-green-700" : "text-red-600"}`}>
                        {event.action === "activate" ? "Activated" : "Deactivated"}
                      </span>{" "}
                      <span className="font-mono text-gray-700">{event.domain}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {event.actorRole === "plugin" ? "via plugin" : event.actorRole === "admin" ? `by admin${event.actorId?.email ? " (" + event.actorId.email + ")" : ""}` : "by customer"}
                      {" · "}{new Date(event.createdAt).toLocaleString()}
                    </p>
                    {event.note && <p className="text-xs text-gray-400 italic mt-0.5">{event.note}</p>}
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

function ForceDeactivateModal({ licenseId, domain, onClose }) {
  const { mutate, isPending } = useForceDeactivateDomain();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Force-Deactivate Domain?</h3>
        <p className="text-sm text-gray-500">
          Admin override — remove <span className="font-mono font-medium text-gray-800">{domain}</span> from this license immediately. The plugin on that site will lose access right away.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 focus:ring-red-500" loading={isPending}
            onClick={() => mutate({ licenseId, domain }, { onSuccess: onClose })}>
            Force deactivate
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDomains() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(null);     // { licenseId, licenseKey }
  const [deactivate, setDeactivate] = useState(null); // { licenseId, domain }

  const { data, isLoading, error } = useAdminDomains({ page, limit: 20, search });
  const { data: stats } = useAdminDomainStats();

  const domains    = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <>
      {history && (
        <HistoryDrawer licenseId={history.licenseId} licenseKey={history.licenseKey} onClose={() => setHistory(null)} />
      )}
      {deactivate && (
        <ForceDeactivateModal {...deactivate} onClose={() => setDeactivate(null)} />
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domains</h1>
          <p className="text-sm text-gray-500 mt-0.5">All websites currently activated across your licenses</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Domains" value={stats?.totalActiveDomains} icon={Globe} color="text-brand-600 bg-brand-50" />
          <StatCard label="Licenses w/ Domains" value={stats?.licensesWithDomains} icon={Package} color="text-purple-600 bg-purple-50" />
          <StatCard label="Activations (24h)" value={stats?.activationsLast24h} icon={Clock} color="text-green-600 bg-green-50" />
          <StatCard label="Activations (7d)" value={stats?.activationsLast7d} icon={Clock} color="text-orange-600 bg-orange-50" />
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : error ? (
          <Alert type="error" message="Failed to load domains." />
        ) : domains.length === 0 ? (
          <div className="card p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No domains activated yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Domains will appear here once customers activate the plugin on their sites.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Domain</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Customer</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Product</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">License</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Activated</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {domains.map((d, i) => (
                    <tr key={`${d.license.id}-${d.domain}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-gray-800">{d.domain}</span>
                          <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer"
                            className="text-gray-300 hover:text-brand-500">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-gray-700">{d.customer?.name || "—"}</p>
                        <p className="text-xs text-gray-400">{d.customer?.email}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-600">{d.product?.name || "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <button onClick={() => setHistory({ licenseId: d.license.id, licenseKey: d.license.key })}
                          className="font-mono text-xs text-brand-600 hover:underline">
                          {d.license.key}
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                        {new Date(d.activatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={d.license.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDeactivate({ licenseId: d.license.id, domain: d.domain })}
                          title="Force deactivate"
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 inline-flex">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <Pagination {...pagination} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
