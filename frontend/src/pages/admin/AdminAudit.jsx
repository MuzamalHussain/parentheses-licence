import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Search } from "lucide-react";
import api from "../../lib/api";
import { Input } from "../../components/ui";
import Pagination from "../../components/ui/Pagination";

const useAuditLogs = (params) =>
  useQuery({
    queryKey: ["admin-audit", params],
    queryFn: () => api.get("/admin/audit", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

function actionColor(action) {
  if (action.includes("revoked") || action.includes("deactivated") || action.includes("suspended")) return "text-red-600 bg-red-50";
  if (action.includes("created") || action.includes("reinstated") || action.includes("published")) return "text-green-600 bg-green-50";
  if (action.includes("updated") || action.includes("reset")) return "text-yellow-700 bg-yellow-50";
  return "text-gray-600 bg-gray-100";
}

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useAuditLogs({ page, limit: 30, action: search });
  const logs = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every administrative action, in order</p>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Filter by action (e.g. license.revoked)..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No audit entries found</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log._id} className="flex items-start gap-3 px-5 py-3.5">
                <span className={`text-xs font-mono font-medium px-2 py-1 rounded-md flex-shrink-0 ${actionColor(log.action)}`}>
                  {log.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{log.actorEmail || log.actorId?.email || "System"}</span>
                    {log.targetType && <span className="text-gray-400"> · {log.targetType}</span>}
                  </p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {Object.entries(log.metadata).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <Pagination {...pagination} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
