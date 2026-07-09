import { AlertTriangle, Fingerprint, KeyRound, Loader2, LockKeyhole, ShieldCheck, Siren } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminSecurityDashboard, useSecurityAction } from "../../hooks/useLicenses";

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

export default function AdminSecurity() {
  const { data, isLoading } = useAdminSecurityDashboard();
  const action = useSecurityAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const runtime = data?.runtimeProtection || {};
  const secrets = data?.secretHealth || {};
  const dependencies = data?.dependencyHealth || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Zero Trust decisions, policy status, secret health, dependency review, and runtime protection</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Security Score" value={data?.securityScore || 0} />
        <Metric label="Runtime Alerts" value={runtime.total || 0} />
        <Metric label="Secrets Review" value={secrets.review || 0} />
        <Metric label="Dependencies" value={dependencies.total || 0} />
        <Metric label="Flagged IPs" value={runtime.flaggedIps || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Zero Trust Dashboard" icon={ShieldCheck}>
            <div className="grid md:grid-cols-2 gap-3">
              {Object.entries(data?.zeroTrust || {}).map(([key, value]) => (
                <Row key={key} title={key.replace(/([A-Z])/g, " $1")} detail="Zero Trust principle" status={value ? "enabled" : "disabled"} />
              ))}
            </div>
          </Panel>

          <Panel title="Policy Manager" icon={Fingerprint}>
            <div className="grid md:grid-cols-2 gap-3">
              {(data?.policyStatus || []).map((policy) => (
                <Row key={policy.id} title={policy.id} detail={`${policy.scope || policy.id} - max risk ${policy.maxRiskScore || "n/a"}`} status={policy.status} />
              ))}
            </div>
          </Panel>

          <Panel title="Runtime Protection" icon={Siren}>
            <div className="space-y-3">
              {(runtime.events || []).slice(0, 8).map((event) => (
                <Row key={event.id} title={event.type} detail={`${event.module} - ${event.message}`} status={event.severity} />
              ))}
              {!runtime.events?.length && <p className="text-sm text-gray-500">No runtime security events captured.</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Secret Health" icon={LockKeyhole}>
            <div className="space-y-3">
              {(secrets.secrets || []).map((secret) => (
                <Row key={secret.id} title={secret.name} detail={secret.externalSecretManagerReady ? "External manager ready" : "Local"} status={secret.status} />
              ))}
            </div>
          </Panel>

          <Panel title="Dependency Health" icon={AlertTriangle}>
            <div className="space-y-3">
              <Row title="Dependency health" detail={`${dependencies.total || 0} packages tracked`} status={dependencies.dependencyHealth} />
              <Row title="Known vulnerabilities" detail={dependencies.knownVulnerabilities || "not scanned"} status="foundation" />
              <Row title="License conflicts" detail={`${dependencies.licenseConflicts || 0} conflicts`} status={dependencies.licenseConflicts ? "review" : "healthy"} />
            </div>
          </Panel>

          <Panel
            title="Session Security"
            icon={KeyRound}
            action={(
              <Button disabled={action.isPending} onClick={() => action.mutate({ action: "policy", scope: "global", body: { status: "enabled" } })}>
                <ShieldCheck className="w-4 h-4" /> Refresh
              </Button>
            )}
          >
            <div className="space-y-3">
              {Object.entries(data?.sessionSecurity || {}).map(([key, value]) => (
                <Row key={key} title={key.replace(/([A-Z])/g, " $1")} detail="Session control" status={value ? "enabled" : "foundation"} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
