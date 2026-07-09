import { useState } from "react";
import { AlertTriangle, Bot, BrainCircuit, HeartPulse, Loader2, Send, Sparkles, Workflow } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAICommand, useAICommandQuestion } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

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

function InlineMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-lg font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminAICommand() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAICommand(activeOrgId);
  const ask = useAICommandQuestion();
  const [question, setQuestion] = useState("What needs my attention today?");
  const [answer, setAnswer] = useState("");

  const submit = () => {
    if (!question.trim() || !activeOrgId) return;
    ask.mutate({ organizationId: activeOrgId, question }, { onSuccess: (result) => setAnswer(result.answer) });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const briefing = data?.briefing || {};
  const business = data?.business || {};
  const workflow = data?.workflow || {};
  const ai = data?.aiProviders || {};
  const security = data?.security || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Operations Command Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Unified operational intelligence across AI, business, workflows, security, and platform health</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Revenue" value={Number(business.revenue || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} />
        <Metric label="Orders" value={business.orders || 0} />
        <Metric label="Pending Approvals" value={workflow.pendingApprovals || 0} />
        <Metric label="High Risks" value={security.riskCounts?.high || 0} />
        <Metric label="AI Cost" value={Number(ai.estimatedCost || 0).toFixed(4)} />
      </div>

      <div className="grid xl:grid-cols-[1fr_22rem] gap-6">
        <div className="space-y-6">
          <Panel title="Executive Brief" icon={BrainCircuit}>
            <div className="grid md:grid-cols-2 gap-4">
              {["dailySummary", "revenueSummary", "renewalSummary", "platformHealth", "securitySummary", "aiUsageSummary"].map((key) => (
                <div key={key} className="rounded-lg border border-gray-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="text-sm text-gray-700 mt-2 leading-6">{briefing[key]}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Alert Center" icon={AlertTriangle}>
            <div className="space-y-3">
              {(data?.alerts || []).slice(0, 8).map((alert) => (
                <div key={`${alert.source}-${alert.title}-${alert.level}`} className="flex items-start justify-between gap-3 border-b border-gray-50 last:border-0 py-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                  </div>
                  <StatusBadge status={alert.level} />
                </div>
              ))}
              {!data?.alerts?.length && <p className="text-sm text-gray-400">No current alerts.</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Command" icon={Sparkles}>
            <div className="flex gap-2">
              <input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
              <button className="btn-primary" disabled={ask.isPending || !question.trim()} onClick={submit}>
                {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {answer && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mt-3 leading-6">{answer}</p>}
          </Panel>

          <Panel title="Provider Status" icon={Bot}>
            <div className="space-y-2">
              {(ai.providers || []).map((provider) => (
                <div key={provider.providerId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{provider.name || provider.providerId}</span>
                  <StatusBadge status={provider.health?.status || provider.status} />
                </div>
              ))}
              <p className="text-xs text-gray-500">Latency {ai.averageLatencyMs || 0}ms · Failures {ai.failures || 0} · Fallbacks {ai.fallbackEvents || 0}</p>
            </div>
          </Panel>

          <Panel title="Workflow Status" icon={Workflow}>
            <div className="grid grid-cols-2 gap-4">
              <InlineMetric label="Running" value={workflow.runningWorkflows || 0} />
              <InlineMetric label="Failed" value={workflow.failedWorkflows || 0} />
            </div>
            <p className="text-xs text-gray-500 mt-3">Success rate {workflow.executionSuccessRate || 0}%</p>
          </Panel>

          <Panel title="Platform Health" icon={HeartPulse}>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>Database</span><StatusBadge status={data?.health?.database?.connectionStatus || "unknown"} /></div>
              <div className="flex justify-between text-sm"><span>Payments</span><StatusBadge status={data?.health?.payments?.failedPayments ? "degraded" : "ok"} /></div>
              <div className="flex justify-between text-sm"><span>Notifications</span><StatusBadge status={data?.health?.notifications?.failed ? "degraded" : "ok"} /></div>
              <div className="flex justify-between text-sm"><span>Queue</span><StatusBadge status={data?.health?.queueWorkers?.failed ? "degraded" : "ok"} /></div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Recommendation Feed" icon={Sparkles}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data?.recommendations || []).map((item) => (
            <div key={`${item.priority}-${item.reason}`} className="rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{item.suggestedAction}</p>
                <StatusBadge status={item.priority} />
              </div>
              <p className="text-sm text-gray-600 mt-2">{item.reason}</p>
              <p className="text-xs text-gray-500 mt-2">Impact: {item.businessImpact} · Confidence {item.confidenceScore}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
