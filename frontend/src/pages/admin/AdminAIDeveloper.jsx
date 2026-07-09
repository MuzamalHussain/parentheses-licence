import { useState } from "react";
import { BookOpen, Braces, Code2, Loader2, Play, ShieldCheck, TerminalSquare, Webhook } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIDeveloper, useAIDeveloperAsk } from "../../hooks/useLicenses";

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
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminAIDeveloper() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIDeveloper(activeOrgId);
  const ask = useAIDeveloperAsk();
  const [question, setQuestion] = useState("Explain how to integrate webhooks safely.");
  const [category, setCategory] = useState("webhook");
  const [language, setLanguage] = useState("javascript");
  const [endpointId, setEndpointId] = useState("listProducts");
  const [answer, setAnswer] = useState(null);
  const dashboard = data?.dashboard || {};
  const endpoints = dashboard.endpoints || [];
  const prompts = dashboard.prompts || [];

  const run = () => {
    ask.mutate({ organizationId: activeOrgId, question, category, language, endpointId }, { onSuccess: setAnswer });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Developer Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Developer copilot for APIs, SDKs, webhooks, plugin integration, debugging, and architecture</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Endpoints" value={dashboard.overview?.endpoints} />
        <Metric label="SDKs" value={dashboard.overview?.sdkCount} />
        <Metric label="Webhook Events" value={dashboard.overview?.webhookEvents} />
        <Metric label="Prompts" value={dashboard.overview?.promptCount} />
        <Metric label="API Version" value={dashboard.overview?.apiVersion === "v1" ? 1 : 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Debug Console" icon={TerminalSquare}>
            <div className="grid md:grid-cols-4 gap-3">
              <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
                {["api", "sdk", "webhook", "plugin", "debug", "architecture", "code"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {["javascript", "typescript", "node", "php", "curl"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="input md:col-span-2" value={endpointId} onChange={(event) => setEndpointId(event.target.value)}>
                {endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.method} {endpoint.path}</option>)}
              </select>
            </div>
            <textarea className="input resize-none mt-3 min-h-28" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button type="button" className="btn-primary mt-3" disabled={ask.isPending || !activeOrgId} onClick={run}>
              {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Generate Guidance
            </button>
            <div className="mt-4 rounded-lg border border-gray-100 p-4">
              <p className="text-sm text-gray-700">{answer?.answer || "Select a prompt, endpoint, and language to generate grounded developer guidance."}</p>
              {answer?.codeExamples?.example && (
                <pre className="mt-4 bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-auto">{answer.codeExamples.example}</pre>
              )}
            </div>
          </Panel>

          <Panel title="Architecture Explorer" icon={Braces}>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {(answer?.context?.databaseRelationships || dashboard.plugin?.endpoints || []).slice(0, 6).map((item, index) => (
                <div key={`${item.from || item}-${index}`} className="rounded-lg border border-gray-100 p-3">
                  <p className="font-medium text-gray-900">{item.from ? `${item.from} -> ${item.to}` : item}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.relation || "Plugin integration endpoint"}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Prompt Library" icon={BookOpen}>
            <div className="space-y-3">
              {prompts.map((prompt) => (
                <button
                  key={prompt.key}
                  type="button"
                  className="w-full text-left rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
                  onClick={() => { setCategory(prompt.category); setQuestion(prompt.prompt); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{prompt.title}</p>
                    <StatusBadge status={prompt.category} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{prompt.prompt}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="SDK Center" icon={Code2}>
            <div className="space-y-2">
              {(dashboard.sdks || []).map((sdk) => (
                <div key={sdk.language} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-gray-800">{sdk.language}</span>
                  <StatusBadge status={sdk.status} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Webhook Assistant" icon={Webhook}>
            <p className="text-sm text-gray-600">Events: {(dashboard.webhooks || []).length}</p>
            <p className="text-xs text-gray-500 mt-2">Signature verification, retry policy, failures, delivery logs, and idempotency guidance are generated from webhook metadata.</p>
          </Panel>

          <Panel title="Safety" icon={ShieldCheck}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Repository edits: disabled</p>
              <p>Terminal execution: disabled</p>
              <p>Deployment actions: disabled</p>
              <p>Secrets exposure: blocked by guidance</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
