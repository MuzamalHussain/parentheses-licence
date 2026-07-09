import { useState } from "react";
import { Bot, CheckCircle2, Clock, Loader2, Play, ShieldCheck, XCircle } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIWorkflows, useAIWorkflowAction } from "../../hooks/useLicenses";

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

export default function AdminAIWorkflows() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIWorkflows(activeOrgId);
  const action = useAIWorkflowAction();
  const approvals = data?.approvals || [];
  const templates = data?.templates || [];
  const policies = data?.policies || [];
  const busy = action.isPending;

  const mutate = (name, id, body = {}) => action.mutate({ action: name, id, organizationId: activeOrgId, body });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Workflow Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Explainable AI workflow recommendations, approval queue, policies, templates, and execution history</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
          </select>
          <button className="btn-primary" disabled={busy || !activeOrgId} onClick={() => mutate("plan")}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            Plan Workflows
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading AI workflows
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1fr_22rem] gap-6">
          <Card title="Approval Queue" icon={Clock}>
            <div className="space-y-3">
              {approvals.length ? approvals.map((item) => (
                <div key={item._id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.category} · {item.mode?.replace(/_/g, " ")} · confidence {item.confidenceScore}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{item.reason}</p>
                  <p className="text-xs text-gray-500 mt-2">{item.expectedOutcome}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {item.status === "pending" && (
                      <>
                        <button className="btn-secondary text-sm" disabled={busy} onClick={() => mutate("approve", item._id)}>
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button className="btn-secondary text-sm" disabled={busy} onClick={() => mutate("reject", item._id)}>
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </>
                    )}
                    {["approved", "pending"].includes(item.status) && (
                      <button className="btn-primary text-sm" disabled={busy || item.mode !== "automatic_execution" && item.status !== "approved"} onClick={() => mutate("execute", item._id)}>
                        <Play className="w-4 h-4" /> Execute
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-400">No AI workflow recommendations yet.</p>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card title="Workflow Templates" icon={Bot}>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div key={template.key} className="text-sm border-b border-gray-50 last:border-0 py-2">
                    <p className="font-medium text-gray-800">{template.title}</p>
                    <p className="text-xs text-gray-500 capitalize">{template.category.replace(/_/g, " ")}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Automation Policies" icon={ShieldCheck}>
              <div className="space-y-2">
                {policies.length ? policies.map((policy) => (
                  <div key={policy._id || `${policy.category}-${policy.scope}`} className="text-sm border-b border-gray-50 last:border-0 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-800 capitalize">{policy.category?.replace(/_/g, " ")}</p>
                      <StatusBadge status={policy.mode?.replace(/_/g, " ")} />
                    </div>
                    <p className="text-xs text-gray-500">{policy.scope} policy</p>
                  </div>
                )) : (
                  <p className="text-sm text-gray-400">Default approval policies are active.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
