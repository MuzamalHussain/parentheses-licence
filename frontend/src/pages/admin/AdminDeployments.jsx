import { CheckCircle2, GitBranch, GitPullRequestArrow, Layers2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminDeploymentDashboard, useDeploymentAction } from "../../hooks/useLicenses";

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

export default function AdminDeployments() {
  const { data, isLoading } = useAdminDeploymentDashboard();
  const action = useDeploymentAction();
  const deployments = data?.deployments || [];
  const approvals = data?.approvals || [];
  const latest = deployments[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deployment Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Environment management, release promotion, approvals, rollback readiness, and health verification</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Deployments" value={deployments.length} />
        <Metric label="Pending Approvals" value={approvals.filter((item) => item.status === "pending").length} />
        <Metric label="Environments" value={data?.environments?.length || 0} />
        <Metric label="Health" value={data?.health?.status || "-"} />
        <Metric label="Pipeline Steps" value={data?.pipeline?.length || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel
            title="Deployment History"
            icon={GitBranch}
            action={(
              <Button disabled={action.isPending} onClick={() => action.mutate({ action: "start", body: { version: `manual-${Date.now()}`, environment: "development" } })}>
                <GitBranch className="w-4 h-4" /> Start
              </Button>
            )}
          >
            <div className="space-y-3">
              {deployments.slice(0, 8).map((deployment) => (
                <Row key={deployment.id} title={`${deployment.version} -> ${deployment.environment}`} detail={`${deployment.id} - ${deployment.durationMs || 0}ms`} status={deployment.status} />
              ))}
              {!deployments.length && <p className="text-sm text-gray-500">No deployments recorded yet.</p>}
            </div>
          </Panel>

          <Panel title="Pipeline" icon={GitPullRequestArrow}>
            <div className="grid md:grid-cols-2 gap-3">
              {(data?.pipeline || []).map((step) => (
                <Row key={step.step} title={step.step.replace(/_/g, " ")} detail="Validation foundation" status={step.enabled ? "enabled" : "disabled"} />
              ))}
            </div>
          </Panel>

          <Panel title="Environment Manager" icon={Layers2}>
            <div className="grid md:grid-cols-2 gap-3">
              {(data?.environments || []).map((env) => (
                <Row key={env.id} title={env.name} detail={`Promotion order ${env.promotionOrder} - approval ${env.requiresApproval ? "required" : "auto"}`} status={env.status} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Approval Queue" icon={ShieldCheck}>
            <div className="space-y-3">
              {approvals.slice(0, 6).map((approval) => (
                <button
                  type="button"
                  key={approval.id}
                  className="w-full text-left"
                  onClick={() => approval.status === "pending" && action.mutate({ action: "approve", id: approval.id, body: { decision: "approve" } })}
                >
                  <Row title={approval.environment} detail={`${approval.version} - ${approval.id}`} status={approval.status} />
                </button>
              ))}
              {!approvals.length && <p className="text-sm text-gray-500">No approvals pending.</p>}
            </div>
          </Panel>

          <Panel title="Health Verification" icon={CheckCircle2}>
            <div className="space-y-3">
              {(data?.health?.checks || []).map((check) => (
                <Row key={check.id} title={check.id.replace(/_/g, " ")} detail={String(check.details || "")} status={check.status} />
              ))}
            </div>
          </Panel>

          <Panel title="Rollback Foundation" icon={RotateCcw}>
            <div className="space-y-3">
              {(data?.rollback || []).slice(0, 5).map((rollback) => (
                <Row key={rollback.deploymentId} title={rollback.rollbackType} detail={rollback.targetVersion || rollback.deploymentId} status={rollback.rollbackStatus} />
              ))}
              {!data?.rollback?.length && <Row title="Rollback validation" detail="Ready after first deployment record" status="foundation" />}
              {latest && (
                <Button disabled={action.isPending} onClick={() => action.mutate({ action: "rollback-validate", body: { deploymentId: latest.id, targetVersion: latest.previousVersion || "previous" } })}>
                  <RotateCcw className="w-4 h-4" /> Validate
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
