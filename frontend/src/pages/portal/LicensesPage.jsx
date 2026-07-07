import { useState } from "react";
import { Key, Globe, Loader2, ChevronDown, Copy, Check, AlertCircle } from "lucide-react";
import { useMyLicenses, useDeactivateDomain, useMyLicenseSites } from "../../hooks/useLicenses";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import { Button } from "../../components/ui";

function CopyKey({ licenseKey }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-1.5 text-gray-400 hover:text-gray-600" title="Copy key">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function DeactivateModal({ licenseId, domain, onClose }) {
  const { mutate, isPending } = useDeactivateDomain();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Deactivate Domain?</h3>
        <p className="text-sm text-gray-500">
          Remove <span className="font-mono font-medium text-gray-800">{domain}</span> from this license?
          This frees a slot. The plugin on that domain will stop working immediately.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 focus:ring-red-500" loading={isPending}
            onClick={() => mutate({ licenseId, domain }, { onSuccess: onClose })}>
            Deactivate
          </Button>
        </div>
      </div>
    </div>
  );
}

function LicenseCard({ license }) {
  const [expanded, setExpanded] = useState(false);
  const [deactivate, setDeactivate] = useState(null);
  const { data: sites = [] } = useMyLicenseSites(license._id, expanded);

  const exp = license.expiresAt ? new Date(license.expiresAt) : null;
  const isExpired = exp && exp < new Date();
  const slotsUsed = license.activeDomains?.length ?? 0;
  const slotsTotal = license.allowedSites === 0 ? "∞" : license.allowedSites;
  const remaining = license.lifecycle?.remainingActivations;
  const daysLeft = exp ? Math.ceil((exp - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const renewalDate = license.subscription?.renewalDate || license.renewal?.nextRenewalAt || license.expiresAt;

  return (
    <>
      {deactivate && (
        <DeactivateModal licenseId={license._id} domain={deactivate} onClose={() => setDeactivate(null)} />
      )}

      <div className="card overflow-hidden">
        {/* Top bar */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-mono text-base font-bold text-gray-900 tracking-widest">
                  {license.licenseKey}
                </span>
                <CopyKey licenseKey={license.licenseKey} />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {license.productId?.name} · <span className="font-medium">{license.planId?.name}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={license.status} />
              <button onClick={() => setExpanded((v) => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{slotsUsed}</span>
              <span className="text-gray-400">/ {slotsTotal} sites</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            {exp ? (
              <span className={`flex items-center gap-1 ${isExpired ? "text-red-500" : daysLeft !== null && daysLeft <= 30 ? "text-orange-500" : "text-gray-500"}`}>
                {isExpired ? <AlertCircle className="w-3.5 h-3.5" /> : null}
                {isExpired ? "Expired" : `Expires ${exp.toLocaleDateString()}`}
                {!isExpired && daysLeft !== null && daysLeft <= 30 && ` (${daysLeft}d left)`}
              </span>
            ) : (
              <span className="text-gray-400">Lifetime license</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs text-gray-500">
            <span className={license.lifecycle?.canDownload ? "text-green-600" : "text-gray-400"}>
              Downloads {license.lifecycle?.canDownload ? "enabled" : "disabled"}
            </span>
            <span className={license.lifecycle?.canUpdate ? "text-green-600" : "text-gray-400"}>
              Updates {license.lifecycle?.canUpdate ? "enabled" : "disabled"}
            </span>
            <span>Remaining activations: {remaining === null || remaining === undefined ? "Unlimited" : remaining}</span>
            <span>Renewal {license.lifecycle?.renewalEligible ? "eligible" : "not eligible"}</span>
            <span>Upgrade {license.lifecycle?.upgradeEligible ? "eligible" : "not eligible"}</span>
            <span>Grace: {license.lifecycle?.gracePeriodDays ?? 0} days</span>
            {renewalDate && <span>Renewal date: {new Date(renewalDate).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Expanded: domains */}
        {expanded && (
          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Active Domains
            </p>
            {license.activeDomains?.length === 0 ? (
              <div className="text-center py-4">
                <Globe className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No domains activated yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Your WordPress plugin will activate automatically when installed.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(sites.length ? sites : license.activeDomains).map((d) => (
                  <div key={d.domain} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                    <div>
                      <p className="font-mono text-sm text-gray-800">{d.siteName || d.domain}</p>
                      <p className="text-xs text-gray-400">
                        {d.environment ? `${d.environment} - ` : ""}
                        Activated {new Date(d.activatedAt).toLocaleDateString()}
                        {d.lastContactAt ? ` - Last seen ${new Date(d.lastContactAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    {license.status === "active" && (
                      <button onClick={() => setDeactivate(d.domain)}
                        className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-md transition-colors">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {license.status === "suspended" && (
              <div className="mt-3 flex items-start gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">This license is suspended. Contact support to reinstate it.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function LicensesPage() {
  const [page, setPage]     = useState(1);
  const [status, setStatus] = useState("");
  const { data, isLoading } = useMyLicenses({ page, limit: 10, status });

  const licenses   = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Licenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination.total ?? "—"} total licenses</p>
        </div>
        {/* Status filter */}
        <div className="flex gap-2">
          {["", "active", "suspended", "expired"].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                status === s
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-brand-400"
              }`}>
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : licenses.length === 0 ? (
        <div className="card p-12 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No licenses found</p>
          <p className="text-sm text-gray-400 mt-1">
            {status ? "Try clearing the filter." : "Purchase a plugin to see your licenses here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {licenses.map((l) => <LicenseCard key={l._id} license={l} />)}
        </div>
      )}

      <Pagination {...pagination} onPage={setPage} />
    </div>
  );
}
