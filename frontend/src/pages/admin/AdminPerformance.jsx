import { Activity, Database, Gauge, Layers3, Loader2, RefreshCw, Zap } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminPerformanceDashboard, usePerformanceAction } from "../../hooks/useLicenses";

function Panel({ title, icon: Icon, children, action }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value || 0}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export default function AdminPerformance() {
  const { data, isLoading } = useAdminPerformanceDashboard();
  const action = usePerformanceAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const cache = data?.cache || {};
  const profiler = data?.profiler || {};
  const budgets = data?.budgets || {};
  const queries = data?.queries || {};
  const capacity = data?.capacity || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Performance Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Distributed caching, profiling, query optimization, latency budgets, and cache operations</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Cache Hit Ratio" value={`${Math.round((cache.stats?.hitRatio || 0) * 100)}%`} />
        <Metric label="Cache Keys" value={cache.memoryKeys || 0} />
        <Metric label="Avg API MS" value={capacity.requestThroughput?.averageResponseTimeMs || 0} />
        <Metric label="Slow APIs" value={profiler.slowApis?.length || 0} />
        <Metric label="Large Payloads" value={profiler.largePayloads?.length || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel
            title="Cache Dashboard"
            icon={Layers3}
            action={(
              <div className="flex gap-2">
                <ActionButton disabled={action.isPending} onClick={() => action.mutate({ action: "warm", body: {} })}>
                  <Zap className="w-4 h-4" /> Warm
                </ActionButton>
                <ActionButton disabled={action.isPending} onClick={() => action.mutate({ action: "invalidate", body: { group: "dashboard" } })}>
                  <RefreshCw className="w-4 h-4" /> Purge
                </ActionButton>
              </div>
            )}
          >
            <div className="grid md:grid-cols-3 gap-3">
              {(cache.policies || []).map((policy) => (
                <div key={policy.name} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-900">{policy.name}</p>
                  <p className="text-xs text-gray-500">{policy.level} - TTL {policy.ttlSeconds}s</p>
                  <p className="text-xs text-gray-400 mt-1">{policy.tags?.join(", ")}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Profiler" icon={Activity}>
            <div className="space-y-3">
              {(profiler.slowApis || []).slice(0, 8).map((api, index) => (
                <div key={`${api.path}-${index}`} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{api.method} {api.path}</p>
                    <p className="text-xs text-gray-500">{api.statusCode} - {api.responseBytes || 0} bytes</p>
                  </div>
                  <StatusBadge status={`${api.durationMs}ms`} />
                </div>
              ))}
              {!(profiler.slowApis || []).length && <p className="text-sm text-gray-500">No slow API samples captured.</p>}
            </div>
          </Panel>

          <Panel title="Query Optimization" icon={Database}>
            <div className="grid md:grid-cols-2 gap-3">
              {(queries.missingIndexes || []).map((item) => (
                <div key={`${item.model}-${item.expected}`} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{item.model}</p>
                    <StatusBadge status={item.present ? "present" : "review"} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.fields?.join(", ")}</p>
                  <p className="text-xs text-gray-400 mt-1">{item.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Performance Budgets" icon={Gauge}>
            <div className="space-y-3 text-sm">
              {Object.entries(budgets.status || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-gray-600">{key}</span>
                  <StatusBadge status={value} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Asset Optimization" icon={Zap}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Gzip: {data?.assets?.gzip ? "enabled" : "pending"}</p>
              <p>Brotli: {data?.assets?.brotli}</p>
              <p>Asset versioning: {data?.assets?.staticAssetVersioning}</p>
              <p>Cache-Control: {data?.assets?.cacheControlHeaders}</p>
            </div>
          </Panel>

          <Panel title="Recommendations" icon={Activity}>
            <div className="space-y-3">
              {(data?.recommendations || []).map((item) => (
                <div key={`${item.area}-${item.message}`} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{item.area}</p>
                    <StatusBadge status={item.priority} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.message}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
