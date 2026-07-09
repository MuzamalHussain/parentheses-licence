import { useMemo, useState } from "react";
import { Bot, BrainCircuit, Gauge, KeyRound, Loader2, MessageSquareText, Plus, RefreshCw } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAIAction, useAdminAI } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminAI() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAI(activeOrgId);
  const action = useAIAction();
  const selectedOrg = useMemo(() => organizations.find((org) => org._id === activeOrgId), [organizations, activeOrgId]);
  const [provider, setProvider] = useState({ providerId: "openai", name: "OpenAI", status: "configured", apiKey: "", fallbackOrder: 10 });
  const [model, setModel] = useState({ providerId: "openai", modelId: "gpt-4.1", displayName: "GPT 4.1", status: "enabled", category: "general", modelTypes: ["chat"], contextWindow: 128000 });
  const [prompt, setPrompt] = useState({ key: "general.system", name: "General System Prompt", category: "general", type: "system", version: "1.0.0", status: "draft", content: "You are a helpful enterprise assistant." });
  const usageTotals = (data?.usage || []).reduce((acc, row) => ({
    requests: acc.requests + Number(row.requests || 0),
    totalTokens: acc.totalTokens + Number(row.totalTokens || 0),
    estimatedCost: acc.estimatedCost + Number(row.estimatedCost || 0),
  }), { requests: 0, totalTokens: 0, estimatedCost: 0 });

  if (!activeOrgId && !isLoading) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold text-gray-900">AI Control Center</h1>
        <p className="text-sm text-gray-500 mt-1">Create or join an organization before configuring AI infrastructure.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Control Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Provider, model, prompt, token, and cost foundation</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Providers" value={data?.providers?.length} />
            <Metric label="Models" value={data?.models?.length} />
            <Metric label="Prompts" value={data?.prompts?.length} />
            <Metric label="Tokens" value={usageTotals.totalTokens} />
          </div>

          <div className="grid xl:grid-cols-3 gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <KeyRound className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Provider Configuration</h2>
              </div>
              <div className="space-y-3">
                <select className="input" value={provider.providerId} onChange={(event) => setProvider({ ...provider, providerId: event.target.value, name: data?.supportedProviders?.find((item) => item.id === event.target.value)?.name || event.target.value })}>
                  {(data?.supportedProviders || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input className="input" value={provider.name} onChange={(event) => setProvider({ ...provider, name: event.target.value })} />
                <input className="input" type="password" value={provider.apiKey} onChange={(event) => setProvider({ ...provider, apiKey: event.target.value })} placeholder="API key" />
                <input className="input" type="number" value={provider.fallbackOrder} onChange={(event) => setProvider({ ...provider, fallbackOrder: Number(event.target.value) })} />
                <button className="btn-primary w-full" disabled={action.isPending} onClick={() => action.mutate({ action: "provider", organizationId: activeOrgId, body: provider })}>
                  Save Provider
                </button>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Model Registry</h2>
              </div>
              <div className="space-y-3">
                <input className="input" value={model.providerId} onChange={(event) => setModel({ ...model, providerId: event.target.value })} placeholder="Provider ID" />
                <input className="input" value={model.modelId} onChange={(event) => setModel({ ...model, modelId: event.target.value })} placeholder="Model ID" />
                <input className="input" value={model.displayName} onChange={(event) => setModel({ ...model, displayName: event.target.value })} placeholder="Display name" />
                <select className="input" value={model.category} onChange={(event) => setModel({ ...model, category: event.target.value })}>
                  {["general", "support", "licensing", "payments", "analytics", "fraud", "automation", "developer", "documentation"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button className="btn-primary w-full" disabled={action.isPending} onClick={() => action.mutate({ action: "model", organizationId: activeOrgId, body: model })}>
                  Register Model
                </button>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquareText className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Prompt Registry</h2>
              </div>
              <div className="space-y-3">
                <input className="input" value={prompt.key} onChange={(event) => setPrompt({ ...prompt, key: event.target.value })} />
                <input className="input" value={prompt.name} onChange={(event) => setPrompt({ ...prompt, name: event.target.value })} />
                <select className="input" value={prompt.category} onChange={(event) => setPrompt({ ...prompt, category: event.target.value })}>
                  {["support", "licensing", "payments", "analytics", "fraud", "automation", "developer", "documentation", "general"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <textarea className="input min-h-24" value={prompt.content} onChange={(event) => setPrompt({ ...prompt, content: event.target.value })} />
                <button className="btn-primary w-full" disabled={action.isPending} onClick={() => action.mutate({ action: "prompt", organizationId: activeOrgId, body: prompt })}>
                  Save Prompt
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Bot className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">{selectedOrg?.name || "Organization"} Providers</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.providers || []).length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No providers configured.</p>}
                {(data?.providers || []).map((item) => (
                  <div key={item._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.providerId} · key {item.apiKeyConfigured ? item.apiKeyFingerprint : "not configured"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.health?.status || item.status} />
                      <button className="btn-secondary btn-sm" onClick={() => action.mutate({ action: "provider-health", organizationId: activeOrgId, providerId: item.providerId })}>
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Usage & Cost</h2>
              </div>
              <div className="grid grid-cols-3 gap-3 p-5">
                <Metric label="Requests" value={usageTotals.requests} />
                <Metric label="Tokens" value={usageTotals.totalTokens} />
                <Metric label="Est. Cost" value={usageTotals.estimatedCost.toFixed(4)} />
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.usage || []).map((row) => (
                  <div key={`${row.providerId}-${row.modelId}`} className="px-5 py-3 text-sm text-gray-600 flex items-center justify-between">
                    <span>{row.providerId} / {row.modelId}</span>
                    <span>{Number(row.totalTokens || 0).toLocaleString()} tokens</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Models</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.models || []).map((item) => (
                  <div key={item._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.displayName}</p>
                      <p className="text-xs text-gray-500">{item.providerId} · {item.modelId} · {item.category}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Prompts</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.prompts || []).map((item) => (
                  <div key={item._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.key} · {item.version} · {item.category}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            className="btn-secondary"
            disabled={action.isPending || !model.modelId}
            onClick={() => action.mutate({ action: "usage", organizationId: activeOrgId, body: { providerId: provider.providerId, modelId: model.modelId, requestType: "chat", promptTokens: 1200, completionTokens: 450, responseTimeMs: 900 } })}
          >
            <Plus className="w-4 h-4" /> Track Sample Usage
          </button>
        </>
      )}
    </div>
  );
}
