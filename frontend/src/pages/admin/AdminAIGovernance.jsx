import { useState } from "react";
import { Activity, BrainCircuit, CheckCircle2, DollarSign, Loader2, Route, ShieldCheck } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIGovernance, useAIGovernanceAction } from "../../hooks/useLicenses";

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

export default function AdminAIGovernance() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIGovernance(activeOrgId);
  const action = useAIGovernanceAction();
  const [monthlyBudget, setMonthlyBudget] = useState(100);
  const [promptKey, setPromptKey] = useState("governance.example");
  const [promptContent, setPromptContent] = useState("You are a governed Parentheses Licence AI assistant. Use scoped platform data only.");
  const overview = data?.overview || {};
  const monitoring = data?.monitoring || {};
  const policy = data?.policy || {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const saveBudget = () => action.mutate({
    action: "policy",
    organizationId: activeOrgId,
    body: {
      name: "Default AI Governance Policy",
      status: "active",
      budgets: { ...(policy.budgets || {}), organizationMonthly: Number(monthlyBudget), monthlyCost: Number(monthlyBudget) },
    },
  });

  const submitPrompt = () => action.mutate({
    action: "prompt",
    organizationId: activeOrgId,
    body: {
      key: promptKey,
      name: promptKey,
      version: "1.0.0",
      category: "general",
      type: "template",
      content: promptContent,
      governanceStatus: "review",
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enterprise AI Command Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Governance, provider routing, model operations, prompt approvals, budgets, and monitoring</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Providers" value={overview.providers?.length || 0} />
        <Metric label="Models" value={overview.models?.length || 0} />
        <Metric label="Prompts" value={overview.prompts?.length || 0} />
        <Metric label="Requests" value={monitoring.requests || 0} />
        <Metric label="Estimated Cost" value={monitoring.estimatedCost || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Monitoring Dashboard" icon={Activity}>
            <div className="grid md:grid-cols-4 gap-4">
              <Metric label="Errors" value={monitoring.errors || 0} />
              <Metric label="Tokens" value={monitoring.tokenUsage || 0} />
              <Metric label="Fallback Events" value={monitoring.fallbackEvents || 0} />
              <Metric label="Avg Latency" value={monitoring.averageLatencyMs || 0} />
            </div>
          </Panel>

          <Panel title="Provider Routing" icon={Route}>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-4">
              <div>
                <p className="font-medium text-gray-900">{data?.routing?.selected?.name || "No provider selected"}</p>
                <p className="text-xs text-gray-500">Strategy: {data?.routing?.strategy || "priority"}</p>
              </div>
              <StatusBadge status={data?.routing?.selected?.health?.status || "unknown"} />
            </div>
            <div className="mt-3 space-y-2">
              {(data?.routing?.fallbackChain || []).slice(0, 5).map((provider) => (
                <div key={provider.providerId} className="flex items-center justify-between text-sm">
                  <span>{provider.name}</span>
                  <StatusBadge status={provider.health?.status || "unknown"} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Prompt Governance" icon={CheckCircle2}>
            <div className="grid md:grid-cols-[14rem_1fr] gap-3">
              <input className="input" value={promptKey} onChange={(event) => setPromptKey(event.target.value)} />
              <input className="input" value={promptContent} onChange={(event) => setPromptContent(event.target.value)} />
            </div>
            <button className="btn-primary mt-3" disabled={action.isPending} onClick={submitPrompt}>Submit for Review</button>
            <div className="mt-4 space-y-2">
              {(data?.approvals || []).slice(0, 6).map((approval) => (
                <div key={`${approval.key}-${approval.version}`} className="flex items-center justify-between text-sm">
                  <span>{approval.key}@{approval.version}</span>
                  <StatusBadge status={approval.status} />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Budget Dashboard" icon={DollarSign}>
            <input className="input" type="number" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} />
            <button className="btn-primary mt-3" disabled={action.isPending} onClick={saveBudget}>Save Budget</button>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>Organization monthly: {policy.budgets?.organizationMonthly || 0}</p>
              <p>Daily limit: {policy.budgets?.dailyCost || 0}</p>
              <p>Alert threshold: {policy.budgets?.costAlertThresholdPercent || 80}%</p>
            </div>
          </Panel>

          <Panel title="Model Operations" icon={BrainCircuit}>
            <div className="space-y-2">
              {(overview.models || []).slice(0, 8).map((model) => (
                <div key={`${model.providerId}-${model.modelId}`} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{model.displayName || model.modelId}</p>
                    <StatusBadge status={model.status} />
                  </div>
                  <p className="text-xs text-gray-500">{model.providerId} {model.isDefault ? "- default" : ""}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Safety Policy" icon={ShieldCheck}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Sensitive data masking: {policy.safety?.maskSensitiveData ? "enabled" : "disabled"}</p>
              <p>Prompt validation: {policy.safety?.validatePrompts ? "enabled" : "disabled"}</p>
              <p>Response validation: {policy.safety?.validateResponses ? "enabled" : "disabled"}</p>
              <p>Prompt injection foundation: {policy.safety?.promptInjectionDetection ? "enabled" : "disabled"}</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
