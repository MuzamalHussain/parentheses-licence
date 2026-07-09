import { useState } from "react";
import { Activity, BarChart3, BrainCircuit, Database, Loader2, Play, RefreshCw, Users } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIForecast, useGenerateAIForecast } from "../../hooks/useLicenses";

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

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value || 0}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminAIForecast() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const [historyDays, setHistoryDays] = useState(90);
  const [forecastDays, setForecastDays] = useState(30);
  const { data: history = [], isLoading } = useAdminAIForecast(activeOrgId);
  const generate = useGenerateAIForecast();
  const [latest, setLatest] = useState(null);
  const forecast = latest || history[0] || {};

  const run = () => {
    generate.mutate({ organizationId: activeOrgId, historicalWindowDays: historyDays, forecastWindowDays: forecastDays }, { onSuccess: setLatest });
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
          <h1 className="text-2xl font-bold text-gray-900">AI Forecast Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Revenue, renewal, customer health, support, and capacity forecasts from platform history</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
          </select>
          <select className="input w-28" value={historyDays} onChange={(event) => setHistoryDays(Number(event.target.value))}>
            {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days}d</option>)}
          </select>
          <select className="input w-28" value={forecastDays} onChange={(event) => setForecastDays(Number(event.target.value))}>
            {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days}d</option>)}
          </select>
          <button className="btn-primary" disabled={generate.isPending || !activeOrgId} onClick={run}>
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Confidence" value={forecast.confidenceScore || 0} hint="explainable score" />
        <Metric label="Forecast Revenue" value={forecast.revenueForecast?.forecastWindowRevenue || 0} />
        <Metric label="Renewals" value={forecast.licenseForecast?.renewals || 0} />
        <Metric label="Expirations" value={forecast.licenseForecast?.expirations || 0} />
        <Metric label="Health" value={forecast.customerHealth?.category || "-"} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Revenue Forecast" icon={BarChart3}>
            <div className="grid md:grid-cols-4 gap-4">
              <Metric label="Weekly" value={forecast.revenueForecast?.weeklyRevenue || 0} />
              <Metric label="Monthly" value={forecast.revenueForecast?.monthlyRevenue || 0} />
              <Metric label="Quarterly" value={forecast.revenueForecast?.quarterlyRevenue || 0} />
              <Metric label="Annual" value={forecast.revenueForecast?.annualRevenue || 0} />
            </div>
          </Panel>

          <Panel title="Customer Health & Churn" icon={Users}>
            <div className="grid md:grid-cols-4 gap-4">
              <Metric label="Health Score" value={forecast.customerHealth?.score || 0} />
              <Metric label="Renewal Probability" value={forecast.churnAnalysis?.renewalProbability || 0} />
              <Metric label="Cancellation Risk" value={forecast.churnAnalysis?.cancellationRisk || 0} />
              <Metric label="Inactive Customers" value={forecast.churnAnalysis?.inactiveCustomers || 0} />
            </div>
          </Panel>

          <Panel title="Capacity Planning" icon={Database}>
            <div className="grid md:grid-cols-3 gap-4">
              <Metric label="Database Records" value={forecast.capacityForecast?.databaseGrowth?.records || 0} />
              <Metric label="Storage Bytes" value={forecast.capacityForecast?.storageUsage?.bytes || 0} />
              <Metric label="API Requests" value={forecast.capacityForecast?.apiTraffic?.requests || 0} />
              <Metric label="Queue Jobs" value={forecast.capacityForecast?.queueGrowth?.jobs || 0} />
              <Metric label="AI Tokens" value={forecast.capacityForecast?.aiTokenUsage?.tokens || 0} />
              <Metric label="Bandwidth Bytes" value={forecast.capacityForecast?.bandwidth?.bytes || 0} />
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Recommendations" icon={BrainCircuit}>
            <div className="space-y-3">
              {(forecast.recommendations || []).length === 0 && <p className="text-sm text-gray-500">No recommendations generated yet.</p>}
              {(forecast.recommendations || []).map((item) => (
                <div key={`${item.type}-${item.title}`} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <StatusBadge status={item.priority} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.action}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Product & Support Demand" icon={Activity}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Product growth: {forecast.productForecast?.productGrowth || 0}</p>
              <p>Download demand: {forecast.productForecast?.downloadDemand?.baseline || 0} / day</p>
              <p>Upgrade demand: {forecast.productForecast?.upgradeDemand || 0}</p>
              <p>Ticket volume: {forecast.supportForecast?.ticketVolume || 0}</p>
              <p>Support workload: {forecast.supportForecast?.supportWorkload || 0}</p>
            </div>
          </Panel>

          <Panel title="Explainability" icon={RefreshCw}>
            <div className="space-y-2 text-xs text-gray-500">
              <p>History: {forecast.explainability?.historicalTimeWindow || "-"}</p>
              <p>Window: {forecast.explainability?.forecastWindow || "-"}</p>
              {(forecast.explainability?.predictionAssumptions || []).map((item) => <p key={item}>{item}</p>)}
              {(forecast.explainability?.knownLimitations || []).slice(0, 2).map((item) => <p key={item}>{item}</p>)}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
