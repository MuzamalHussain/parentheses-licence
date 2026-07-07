import { Activity, AlertTriangle, CheckCircle2, Clock, Database, HardDrive, Loader2, Mail, RefreshCw, ShieldCheck, ShoppingCart, Workflow } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminOperationsDashboard, useOperationsAction } from "../../hooks/useLicenses";

function Card({ title, icon: Icon, children }) {
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
    <div>
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function HealthRow({ label, value }) {
  const status = value?.status || value?.state || value || "unknown";
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <StatusBadge status={status} />
    </div>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary text-sm disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export default function AdminOperations() {
  const { data, isLoading } = useAdminOperationsDashboard();
  const action = useOperationsAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const health = data?.systemHealth || {};
  const queue = data?.queue || {};
  const email = data?.email || {};
  const payments = data?.payments || {};
  const license = data?.licenseServer || {};
  const api = data?.api || {};
  const database = data?.database || {};
  const maintenance = data?.maintenance || {};
  const busy = action.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform health and runtime status</p>
        </div>
        <StatusBadge status={health.status || "unknown"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card title="System Health" icon={ShieldCheck}>
          <HealthRow label="API" value={health.api} />
          <HealthRow label="Database" value={health.database} />
          <HealthRow label="Storage" value={health.storage} />
          <HealthRow label="Notifications" value={health.notifications} />
          <HealthRow label="Payments" value={health.payments} />
          <HealthRow label="License Server" value={health.licenseServer} />
        </Card>

        <Card title="Queue Monitor" icon={Workflow}>
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Pending" value={queue.pending} />
            <Metric label="Running" value={queue.running} />
            <Metric label="Completed" value={queue.completed} />
            <Metric label="Failed" value={queue.failed} />
            <Metric label="Retries" value={queue.retryQueue} />
          </div>
        </Card>

        <Card title="Email Monitor" icon={Mail}>
          <div className="grid grid-cols-4 gap-4">
            <Metric label="Sent" value={email.sent} />
            <Metric label="Pending" value={email.pending} />
            <Metric label="Failed" value={email.failed} />
            <Metric label="Retries" value={email.retries} />
          </div>
        </Card>

        <Card title="Payment Monitor" icon={ShoppingCart}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Metric label="Webhook Queue" value={payments.webhookQueue} />
            <Metric label="Failed" value={payments.failedPayments} />
            <Metric label="Refund Queue" value={payments.refundQueue} />
          </div>
          <div className="space-y-2">
            {payments.gateways?.map((gateway) => (
              <div key={gateway.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{gateway.name}</span>
                <StatusBadge status={gateway.operational ? "ok" : gateway.enabled ? "degraded" : "disabled"} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="License Server" icon={CheckCircle2}>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Validations" value={license.validationRequests} />
            <Metric label="Activations" value={license.activationRequests} />
            <Metric label="Heartbeats" value={license.heartbeatRequests} />
            <Metric label="Failed Validations" value={license.failedValidations} />
          </div>
        </Card>

        <Card title="API Monitor" icon={Activity}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Metric label="Requests" value={api.totalRequests} />
            <Metric label="Avg ms" value={api.averageResponseTime} />
            <Metric label="Max ms" value={api.maxResponseTime} />
          </div>
          <div className="space-y-2">
            {api.slowEndpoints?.slice(0, 4).map((route) => (
              <div key={`${route.method}-${route.path}-${route.statusGroup}`} className="flex items-center justify-between text-xs">
                <span className="text-gray-500 truncate">{route.method} {route.path}</span>
                <span className="font-mono text-gray-700">{route.avgDurationMs}ms</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Database Health" icon={Database}>
          <HealthRow label="Connection" value={database.connectionStatus} />
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Metric label="Collections" value={database.collectionCount} />
            <Metric label="Data Size" value={database.storageUsage?.dataSize} />
            <Metric label="Index Size" value={database.storageUsage?.indexSize} />
          </div>
        </Card>

        <Card title="Error Center" icon={AlertTriangle}>
          {data?.errors?.length ? data.errors.slice(0, 5).map((err) => (
            <div key={`${err.timestamp}-${err.requestId || err.message}`} className="py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-800 truncate">{err.message}</p>
                <StatusBadge status={err.severity} />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{err.source} · {new Date(err.timestamp).toLocaleString()}</p>
            </div>
          )) : (
            <p className="text-sm text-gray-400">No recent errors.</p>
          )}
        </Card>

        <Card title="Maintenance Center" icon={HardDrive}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Metric label="Maintenance" value={maintenance.maintenanceMode ? 1 : 0} />
            <Metric label="Read-only" value={maintenance.readOnlyMode ? 1 : 0} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton disabled={busy} onClick={() => action.mutate({ action: "set-maintenance", body: { maintenanceMode: !maintenance.maintenanceMode } })}>
              <Clock className="w-4 h-4" /> Toggle Maintenance
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => action.mutate({ action: "clear-cache" })}>
              <RefreshCw className="w-4 h-4" /> Clear Cache
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => action.mutate({ action: "restart-jobs" })}>
              <Workflow className="w-4 h-4" /> Restart Jobs
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => action.mutate({ action: "rebuild-analytics" })}>
              <Activity className="w-4 h-4" /> Rebuild Analytics
            </ActionButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
