import { useState } from "react";
import { AlertTriangle, Fingerprint, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIFraud } from "../../hooks/useLicenses";

function Metric({ label, value, tone = "default" }) {
  const tones = {
    default: "text-gray-900",
    high: "text-red-700",
    medium: "text-amber-700",
    low: "text-emerald-700",
  };
  return (
    <div className="card p-4">
      <p className={`text-xl font-bold ${tones[tone] || tones.default}`}>{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function EvidenceList({ evidence = [] }) {
  return (
    <div className="space-y-1 mt-2">
      {evidence.slice(0, 3).map((item) => (
        <p key={`${item.source}-${item.metric}`} className="text-xs text-gray-500">
          {item.metric}: {String(item.value)} threshold {String(item.threshold)}
        </p>
      ))}
    </div>
  );
}

export default function AdminAIFraud() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const [period, setPeriod] = useState("7d");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIFraud(activeOrgId, { period });
  const dashboard = data?.dashboard || {};
  const counts = dashboard.counts || {};
  const risks = dashboard.currentRisks || [];
  const recommendations = dashboard.recommendations || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Fraud & Security Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Explainable risk scoring for licenses, accounts, downloads, payments, organizations, and API usage</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-36" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
          <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Running security analysis
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Metric label="Critical Risks" value={counts.critical} tone="high" />
            <Metric label="High Risks" value={counts.high} tone="high" />
            <Metric label="Medium Risks" value={counts.medium} tone="medium" />
            <Metric label="Low Risks" value={counts.low} tone="low" />
          </div>

          <div className="grid xl:grid-cols-[1fr_22rem] gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Current Risks</h2>
              </div>
              <div className="space-y-3">
                {risks.length ? risks.slice(0, 10).map((risk) => (
                  <div key={`${risk.entityType}-${risk.entityId || risk.title}-${risk.score}`} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{risk.title}</p>
                        <p className="text-xs text-gray-500 capitalize">{risk.entityType} · confidence {risk.confidenceLevel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{risk.score}</span>
                        <StatusBadge status={risk.riskLevel} />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{risk.description}</p>
                    <EvidenceList evidence={risk.evidence} />
                  </div>
                )) : (
                  <p className="text-sm text-gray-400">No risk evidence found for this period.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-5 h-5 text-gray-500" />
                  <h2 className="font-semibold text-gray-900">Recommendations</h2>
                </div>
                <div className="space-y-3">
                  {recommendations.slice(0, 8).map((item) => (
                    <div key={`${item.key}-${item.entityType}-${item.entityId || item.riskTitle}`} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{item.action}</p>
                        <span className="text-xs capitalize text-gray-500">{item.priority}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{item.rationale}</p>
                      <p className="text-xs text-gray-500 mt-2">Recommendation only</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Fingerprint className="w-5 h-5 text-gray-500" />
                  <h2 className="font-semibold text-gray-900">Recent Security Events</h2>
                </div>
                <div className="space-y-2">
                  {(dashboard.recentSecurityEvents || []).slice(0, 8).map((event) => (
                    <div key={`${event._id || event.action}-${event.createdAt}`} className="text-sm border-b border-gray-50 last:border-0 py-2">
                      <p className="font-medium text-gray-800 truncate">{event.action}</p>
                      <p className="text-xs text-gray-500">{event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Explainability</h2>
            </div>
            <p className="text-sm text-gray-700">Data sources: {(dashboard.explainability?.dataSources || []).join(", ")}</p>
            <div className="mt-2 space-y-1">
              {(dashboard.explainability?.limitations || []).map((item) => (
                <p key={item} className="text-xs text-gray-500">{item}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
