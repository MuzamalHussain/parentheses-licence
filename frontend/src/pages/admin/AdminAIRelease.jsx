import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Play, Rocket, ShieldAlert, Wrench } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminVersions } from "../../hooks/useVersions";
import { useAdminAIReleaseHistory, useAnalyzeAIRelease } from "../../hooks/useLicenses";
import api from "../../lib/api";

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

export default function AdminAIRelease() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data: productsData } = useQuery({
    queryKey: ["admin-products-ai-release"],
    queryFn: () => api.get("/products", { params: { limit: 100 } }).then((r) => r.data),
  });
  const products = productsData?.data || productsData?.items || productsData || [];
  const [productId, setProductId] = useState("");
  const activeProductId = productId || products[0]?._id || "";
  const { data: versions = [] } = useAdminVersions(activeProductId);
  const [versionId, setVersionId] = useState("");
  const activeVersionId = versionId || versions[0]?._id || "";
  const { data: history = [] } = useAdminAIReleaseHistory(activeOrgId, activeProductId);
  const analyze = useAnalyzeAIRelease();
  const [latest, setLatest] = useState(null);
  const insight = latest || history[0] || {};

  const run = () => {
    if (!activeOrgId || !activeProductId || !activeVersionId) return;
    analyze.mutate({ organizationId: activeOrgId, productId: activeProductId, versionId: activeVersionId }, { onSuccess: setLatest });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Release Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Release analysis, compatibility, risk, notes, health, and rollout recommendations</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
          </select>
          <select className="input max-w-xs" value={activeProductId} onChange={(event) => { setProductId(event.target.value); setVersionId(""); }}>
            {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
          </select>
          <select className="input w-40" value={activeVersionId} onChange={(event) => setVersionId(event.target.value)}>
            {versions.map((version) => <option key={version._id} value={version._id}>{version.versionNumber}</option>)}
          </select>
          <button className="btn-primary" disabled={analyze.isPending || !activeVersionId} onClick={run}>
            {analyze.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Analyze
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_22rem] gap-6">
        <div className="space-y-6">
          <Panel title="Release Analysis" icon={Rocket}>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">Version</p>
                <p className="text-lg font-bold text-gray-900">{insight.releaseAnalysis?.version?.versionNumber || "-"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">Channel</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{insight.releaseAnalysis?.version?.releaseChannel || "-"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">Validation</p>
                <p className="text-lg font-bold text-gray-900">{insight.releaseAnalysis?.releaseMetadata?.validationStatus || "-"}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <p className="text-sm text-gray-700">{insight.releaseAnalysis?.featureSummary}</p>
              <p className="text-sm text-gray-700">{insight.releaseAnalysis?.bugFixSummary}</p>
              <p className="text-sm text-gray-700">{insight.releaseAnalysis?.securityFixSummary}</p>
            </div>
          </Panel>

          <Panel title="Compatibility Report" icon={Wrench}>
            <div className="grid md:grid-cols-2 gap-4">
              <p className="text-sm text-gray-700">WordPress requires {insight.compatibility?.wordpress?.requiresAtLeast || "unspecified"}; at-risk sites {insight.compatibility?.wordpress?.activeSitesBelowRequirement || 0}</p>
              <p className="text-sm text-gray-700">PHP requires {insight.compatibility?.php?.requiresAtLeast || "unspecified"}; at-risk sites {insight.compatibility?.php?.activeSitesBelowRequirement || 0}</p>
              <p className="text-sm text-gray-700">Database migration impact: {insight.compatibility?.databaseMigrationImpact || "unknown"}</p>
              <p className="text-sm text-gray-700">Active licenses impacted: {insight.compatibility?.customerImpact?.activeLicenses || 0}</p>
            </div>
          </Panel>

          <Panel title="Generated Release Notes" icon={FileText}>
            <div className="space-y-3 text-sm text-gray-700">
              <p><span className="font-semibold">Customer:</span> {insight.releaseNotes?.customerReleaseNotes}</p>
              <p><span className="font-semibold">Technical:</span> {insight.releaseNotes?.technicalReleaseNotes}</p>
              <p><span className="font-semibold">Migration:</span> {insight.releaseNotes?.migrationGuide}</p>
              <p><span className="font-semibold">Upgrade:</span> {insight.releaseNotes?.upgradeGuide}</p>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Risk Dashboard" icon={ShieldAlert}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900">{insight.riskAssessment?.score || 0}</p>
                <p className="text-xs text-gray-500">Confidence {insight.riskAssessment?.confidenceScore || 0}</p>
              </div>
              <StatusBadge status={insight.riskAssessment?.riskLevel || "unknown"} />
            </div>
            <div className="mt-4 space-y-2">
              {(insight.riskAssessment?.supportingEvidence || []).slice(0, 5).map((item) => (
                <p key={`${item.source}-${item.message}`} className="text-xs text-gray-500">{item.message}</p>
              ))}
            </div>
          </Panel>

          <Panel title="Rollout Recommendation" icon={Rocket}>
            <p className="text-lg font-bold text-gray-900 capitalize">{String(insight.rolloutStrategy?.strategy || "pending").replace(/_/g, " ")}</p>
            <p className="text-sm text-gray-600 mt-2">{insight.rolloutStrategy?.rationale}</p>
            <p className="text-xs text-gray-500 mt-2">Rollback preparation: {insight.rolloutStrategy?.rollbackPreparation ? "recommended" : "standard monitoring"}</p>
          </Panel>

          <Panel title="Release Health" icon={ShieldAlert}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p>Downloads: {insight.releaseHealth?.downloads || 0}</p>
              <p>Adoption: {insight.releaseHealth?.upgradeAdoption || 0}</p>
              <p>Failures: {insight.releaseHealth?.upgradeFailures || 0}</p>
              <p>Support: {insight.releaseHealth?.supportTicketVolume || 0}</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
