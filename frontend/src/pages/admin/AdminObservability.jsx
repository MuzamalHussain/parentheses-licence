import { Activity, AlertTriangle, BarChart3, Bug, Clock3, GitBranch, Loader2, ShieldCheck } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminObservabilityDashboard, useObservabilityAction } from "../../hooks/useLicenses";

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
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

function MiniRow({ title, detail, status }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">{detail}</p>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
}

export default function AdminObservability() {
  const { data, isLoading } = useAdminObservabilityDashboard();
  const action = useObservabilityAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const incidents = data?.incidents || {};
  const alerts = data?.alerts || {};
  const traces = data?.traces || {};
  const logs = data?.logs || {};
  const slo = data?.slo || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Observability Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Structured logs, metrics, tracing, alerts, incidents, and SLO/SLA foundations</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Platform Health" value={data?.health?.status || "-"} />
        <Metric label="API Requests" value={metrics.api?.requests || 0} />
        <Metric label="Error Rate" value={`${Math.round((metrics.api?.errorRate || 0) * 100)}%`} />
        <Metric label="Open Incidents" value={incidents.open || 0} />
        <Metric label="Open Alerts" value={alerts.open || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Metrics Dashboard" icon={BarChart3}>
            <div className="grid md:grid-cols-4 gap-4">
              <Metric label="Avg Response MS" value={metrics.api?.averageResponseTimeMs || 0} />
              <Metric label="Queue Pending" value={metrics.queue?.pending || 0} />
              <Metric label="Cache Hit Ratio" value={`${Math.round((metrics.cache?.hitRatio || 0) * 100)}%`} />
              <Metric label="AI Requests" value={metrics.ai?.requests || 0} />
            </div>
          </Panel>

          <Panel title="Incident Dashboard" icon={Bug}>
            <div className="space-y-3">
              {(incidents.incidents || []).slice(0, 6).map((incident) => (
                <MiniRow key={incident.id} title={incident.title} detail={`${incident.createdAt} - ${incident.affectedServices?.join(", ") || "platform"}`} status={incident.status} />
              ))}
              {!(incidents.incidents || []).length && <p className="text-sm text-gray-500">No incidents recorded.</p>}
            </div>
          </Panel>

          <Panel title="Tracing Explorer" icon={GitBranch}>
            <div className="space-y-3">
              {(traces.recent || []).slice(0, 6).map((trace) => (
                <MiniRow key={trace.traceId} title={trace.endpoint || trace.module} detail={`${trace.traceId} - ${trace.durationMs || 0}ms`} status={trace.status} />
              ))}
              {!(traces.recent || []).length && <p className="text-sm text-gray-500">No traces captured yet.</p>}
            </div>
          </Panel>

          <Panel title="Error Explorer" icon={AlertTriangle}>
            <div className="space-y-3">
              {(logs.recent || []).filter((log) => ["error", "critical", "warn"].includes(log.severity)).slice(0, 6).map((log) => (
                <MiniRow key={log.id} title={log.event} detail={`${log.module} - ${log.endpoint || log.traceId}`} status={log.severity} />
              ))}
              {!((logs.recent || []).filter((log) => ["error", "critical", "warn"].includes(log.severity)).length) && <p className="text-sm text-gray-500">No warning or error logs captured.</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Alert Center" icon={AlertTriangle}>
            <div className="space-y-3">
              {(alerts.alerts || []).slice(0, 6).map((alert) => (
                <button
                  type="button"
                  key={alert.id}
                  onClick={() => alert.status === "open" && action.mutate({ action: "acknowledge-alert", id: alert.id })}
                  className="w-full text-left"
                >
                  <MiniRow title={alert.message} detail={`${alert.value} / ${alert.threshold}`} status={alert.status} />
                </button>
              ))}
              {!(alerts.alerts || []).length && <p className="text-sm text-gray-500">No alerts triggered.</p>}
            </div>
          </Panel>

          <Panel title="SLO / SLA" icon={ShieldCheck}>
            <div className="space-y-3 text-sm">
              <MiniRow title="Availability" detail={`${Math.round((slo.availability || 0) * 10000) / 100}%`} status={slo.availability >= 0.995 ? "within_slo" : "watch"} />
              <MiniRow title="Latency" detail={`${slo.latency?.currentMs || 0}ms / ${slo.latency?.targetMs || 0}ms`} status={slo.latency?.status} />
              <MiniRow title="Success Rate" detail={`${Math.round((slo.successRate || 0) * 10000) / 100}%`} status={slo.successRate >= 0.995 ? "healthy" : "watch"} />
            </div>
          </Panel>

          <Panel title="Log Summary" icon={Activity}>
            <div className="space-y-2 text-sm text-gray-600">
              {Object.entries(logs.bySeverity || {}).map(([severity, count]) => (
                <div key={severity} className="flex items-center justify-between">
                  <span>{severity}</span>
                  <StatusBadge status={String(count)} />
                </div>
              ))}
              {!Object.keys(logs.bySeverity || {}).length && <p>No logs captured yet.</p>}
            </div>
          </Panel>

          <Panel title="Timeline" icon={Clock3}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Trace sampling: foundation</p>
              <p>Log buffering: enabled</p>
              <p>Metrics aggregation: enabled</p>
              <p>External exporters: ready later</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
