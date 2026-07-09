import { useState } from "react";
import { BrainCircuit, Loader2, Send, TrendingUp } from "lucide-react";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIBusiness, useAskAIBusiness } from "../../hooks/useLicenses";

function formatMetric(metric) {
  if (metric?.key === "revenue") {
    return Number(metric.value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  return Number(metric?.value || 0).toLocaleString();
}

function MetricCard({ metric }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{formatMetric(metric)}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-xs text-gray-500">{metric.label}</p>
        <span className={`text-xs font-semibold ${metric.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {metric.changePercent || 0}%
        </span>
      </div>
    </div>
  );
}

function SummaryBlock({ title, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-sm text-gray-700 leading-6">{value}</p>
    </div>
  );
}

export default function AdminAIBusiness() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const [period, setPeriod] = useState("30d");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIBusiness(activeOrgId, { period });
  const ask = useAskAIBusiness();
  const [question, setQuestion] = useState("What should I focus on today?");
  const [answer, setAnswer] = useState(null);
  const dashboard = data?.dashboard || {};
  const summary = dashboard.summary || {};
  const metrics = dashboard.supportingMetrics || [];
  const recommendations = dashboard.recommendations || [];

  const submit = () => {
    if (!question.trim() || !activeOrgId) return;
    ask.mutate({ organizationId: activeOrgId, question, period }, { onSuccess: setAnswer });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Executive Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Grounded business insights from analytics, orders, payments, licenses, downloads, products, and versions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-40" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="today">Today</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
            <option value="1y">1 Year</option>
          </select>
          <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading executive insights
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {metrics.slice(0, 5).map((metric) => <MetricCard key={metric.key} metric={metric} />)}
          </div>

          <div className="grid xl:grid-cols-[1fr_22rem] gap-6">
            <div className="card p-5 space-y-5">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Executive Summary</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <SummaryBlock title="Revenue" value={summary.revenueSummary} />
                <SummaryBlock title="Growth" value={summary.growthSummary} />
                <SummaryBlock title="Customers" value={summary.customerSummary} />
                <SummaryBlock title="Licenses" value={summary.licenseSummary} />
                <SummaryBlock title="Downloads" value={summary.downloadSummary} />
                <SummaryBlock title="Platform Health" value={summary.platformHealthSummary} />
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Explainability</p>
                <p className="mt-2 text-sm text-gray-700">Confidence: {dashboard.confidenceLevel || "medium"}</p>
                <p className="mt-1 text-sm text-gray-700">Data sources: {(dashboard.dataSources || []).join(", ")}</p>
                <p className="mt-1 text-sm text-gray-700">Range: {dashboard.timeRange?.period || period}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-gray-500" />
                  <h2 className="font-semibold text-gray-900">Recommendations</h2>
                </div>
                <div className="space-y-3">
                  {recommendations.map((item) => (
                    <div key={item.key} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                        <span className="text-xs capitalize text-gray-500">{item.priority}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{item.rationale}</p>
                      <p className="text-xs text-gray-500 mt-2">{item.action}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Ask Business AI</h2>
                <div className="flex gap-2">
                  <input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
                  <button className="btn-primary" disabled={ask.isPending || !question.trim()} onClick={submit}>
                    {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                {answer?.answer && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 leading-6">
                    {answer.answer}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Recent Insight Records</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Question</th>
                    <th className="text-left py-2">Confidence</th>
                    <th className="text-left py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.history || []).map((item) => (
                    <tr key={item._id} className="border-t border-gray-100">
                      <td className="py-2 capitalize">{String(item.type || "").replace(/_/g, " ")}</td>
                      <td className="py-2 text-gray-600">{item.question || "Executive summary"}</td>
                      <td className="py-2 capitalize">{item.confidenceLevel}</td>
                      <td className="py-2 text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
