import { useState } from "react";
import { Download, Package, Loader2, Clock, FileText, ChevronDown, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useMyLicenses } from "../../hooks/useLicenses";
import { useProductVersions, useRequestDownload, useMyDownloadHistory } from "../../hooks/useVersions";
import Pagination from "../../components/ui/Pagination";

function ProductDownloadCard({ license }) {
  const [expanded, setExpanded] = useState(false);
  const { data: versionData, isLoading } = useProductVersions(license.productId?._id);
  const { mutateAsync, isPending } = useRequestDownload();

  const handleDownload = async (pluginVersionId) => {
    try {
      const res = await mutateAsync({ licenseId: license._id, pluginVersionId });
      const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(/\/api\/v1$/, "");
      window.location.href = `${apiBase}${res.data.downloadUrl}`;
      toast.success(`Downloading v${res.data.version.versionNumber}...`);
    } catch {
      // error toast handled by hook
    }
  };

  const latest = versionData?.latest;
  const history = versionData?.history || [];
  const isLicenseUsable = license.status === "active";

  return (
    <div className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{license.productId?.name}</p>
              <p className="text-xs text-gray-400 font-mono">{license.licenseKey}</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-brand-500 animate-spin" /></div>
        ) : !latest ? (
          <p className="text-sm text-gray-400 mt-4 italic">No published version available yet.</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Latest: v{latest.versionNumber}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Released {latest.releasedAt ? new Date(latest.releasedAt).toLocaleDateString() : "—"}
                </p>
              </div>
              <Button
                onClick={() => handleDownload(latest._id)}
                disabled={!isLicenseUsable || isPending}
                title={!isLicenseUsable ? `License is ${license.status}` : ""}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download
              </Button>
            </div>

            {!isLicenseUsable && (
              <p className="text-xs text-yellow-600 mt-2">
                Your license is {license.status}. Downloads are disabled until it's active.
              </p>
            )}

            {latest.changelog && (
              <p className="text-sm text-gray-500 mt-3 whitespace-pre-wrap">{latest.changelog}</p>
            )}
          </div>
        )}

        {history.length > 1 && (
          <button onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-brand-600 hover:underline mt-4">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Hide" : "Show"} version history ({history.length})
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
          {history.map((v) => (
            <div key={v._id} className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  v{v.versionNumber} {v.isPublished && <span className="text-xs text-green-600">(current)</span>}
                </p>
                {v.changelog && <p className="text-xs text-gray-400 truncate max-w-md">{v.changelog}</p>}
              </div>
              <button
                onClick={() => handleDownload(v._id)}
                disabled={!isLicenseUsable || isPending}
                className="text-xs text-brand-600 hover:underline disabled:text-gray-300 disabled:no-underline flex-shrink-0 ml-3"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Button({ children, className = "", ...props }) {
  return (
    <button className={`btn-primary text-sm ${className}`} {...props}>
      {children}
    </button>
  );
}

function DownloadHistorySection() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyDownloadHistory({ page, limit: 10 });

  const downloads = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Download History</h2>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : downloads.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No downloads yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {downloads.map((d) => (
              <div key={d._id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-700">
                      v{d.pluginVersionId?.versionNumber || "—"}{" "}
                      <span className="text-gray-400 font-mono text-xs">({d.licenseId?.licenseKey})</span>
                    </p>
                    <p className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                {d.usedAt ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Link not used</span>
                )}
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <Pagination {...pagination} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  );
}

export default function DownloadsPage() {
  const { data: licData, isLoading } = useMyLicenses({ limit: 50 });
  const licenses = licData?.data || [];

  // Show one card per unique product (avoid duplicate cards if customer has multiple licenses for same product)
  const seen = new Set();
  const uniqueProductLicenses = licenses.filter((l) => {
    const pid = l.productId?._id;
    if (!pid || seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Downloads</h1>
        <p className="text-sm text-gray-500 mt-0.5">Download the latest plugin version for your licenses</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : uniqueProductLicenses.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No licenses yet</p>
          <p className="text-sm text-gray-400 mt-1">Purchase a plugin to download it here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {uniqueProductLicenses.map((l) => <ProductDownloadCard key={l._id} license={l} />)}
        </div>
      )}

      <DownloadHistorySection />
    </div>
  );
}
