import { ArchiveRestore, CheckCircle2, Clock3, DatabaseBackup, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminDisasterRecoveryDashboard, useDisasterRecoveryAction } from "../../hooks/useLicenses";

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

function Button({ children, onClick, disabled }) {
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

function Row({ title, detail, status }) {
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

export default function AdminDisasterRecovery() {
  const { data, isLoading } = useAdminDisasterRecoveryDashboard();
  const action = useDisasterRecoveryAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const readiness = data?.readiness || {};
  const backups = data?.backups || [];
  const latest = backups[backups.length - 1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup & Recovery Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Backup policies, restore validation, disaster recovery plans, and continuity readiness</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Readiness" value={readiness.status || "-"} />
        <Metric label="Backups" value={backups.length} />
        <Metric label="Backup Success" value={`${Math.round((readiness.backupSuccessRate || 0) * 100)}%`} />
        <Metric label="RTO Minutes" value={readiness.rtoMinutes || 0} />
        <Metric label="RPO Minutes" value={readiness.rpoMinutes || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel
            title="Backup Center"
            icon={DatabaseBackup}
            action={(
              <Button disabled={action.isPending} onClick={() => action.mutate({ action: "backup", body: { type: "manual" } })}>
                <DatabaseBackup className="w-4 h-4" /> Backup
              </Button>
            )}
          >
            <div className="space-y-3">
              {backups.slice(-6).reverse().map((backup) => (
                <Row key={backup.id} title={backup.id} detail={`${backup.type} - ${backup.targets?.length || 0} targets - ${backup.durationMs || 0}ms`} status={backup.status} />
              ))}
              {!backups.length && <p className="text-sm text-gray-500">No backups recorded yet.</p>}
            </div>
          </Panel>

          <Panel title="Restore Center" icon={RotateCcw}>
            <div className="space-y-3">
              <Row title="Entire Platform" detail="Dry-run restore validation available" status={latest ? "ready" : "needs_backup"} />
              <Row title="Organization" detail="Scoped restore validation with target ID" status={latest ? "ready" : "needs_backup"} />
              <Row title="User / License / Order" detail="Granular restore validation foundation" status={latest ? "ready" : "needs_backup"} />
              {latest && (
                <Button disabled={action.isPending} onClick={() => action.mutate({ action: "restore-validate", body: { backupId: latest.id, scope: "entire_platform" } })}>
                  <CheckCircle2 className="w-4 h-4" /> Validate Latest
                </Button>
              )}
            </div>
          </Panel>

          <Panel title="Recovery Plans" icon={ArchiveRestore}>
            <div className="grid md:grid-cols-2 gap-3">
              {(data?.recoveryPlans || []).map((plan) => (
                <Row key={plan.id} title={plan.title} detail={`RTO ${plan.rtoMinutes}m - RPO ${plan.rpoMinutes}m`} status={plan.severity} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Recovery Readiness" icon={ShieldCheck}>
            <div className="space-y-3">
              <Row title="Service Status" detail={data?.health?.status || "-"} status={data?.health?.status} />
              <Row title="Maintenance Mode" detail={data?.operations?.maintenanceMode ? "enabled" : "disabled"} status={data?.operations?.maintenanceMode ? "enabled" : "disabled"} />
              <Row title="Read-only Mode" detail={data?.operations?.readOnlyMode ? "enabled" : "disabled"} status={data?.operations?.readOnlyMode ? "enabled" : "disabled"} />
              <Row title="Latest Backup" detail={readiness.latestBackupAt || "none"} status={readiness.status} />
            </div>
          </Panel>

          <Panel title="Backup Policies" icon={Clock3}>
            <div className="space-y-3">
              {(data?.policies || []).map((policy) => (
                <Row key={policy.id} title={policy.name} detail={`${policy.retentionDays} days - ${policy.targets?.length || 0} targets`} status={policy.enabled ? "enabled" : "disabled"} />
              ))}
            </div>
          </Panel>

          <Panel title="Schedules" icon={Clock3}>
            <div className="space-y-3">
              {(data?.schedules || []).map((schedule) => (
                <Row key={schedule.id} title={schedule.frequency} detail={`${schedule.backupType} - ${schedule.cron}`} status={schedule.enabled ? "enabled" : "disabled"} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
