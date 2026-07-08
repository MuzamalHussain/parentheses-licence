import { useEffect, useMemo, useState } from "react";
import { Archive, Download, FileCheck2, Gavel, Loader2, ShieldAlert, UserX } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminCompliance, useComplianceAction } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-gray-100 px-3 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function AdminCompliance() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminCompliance(activeOrgId);
  const action = useComplianceAction();
  const [policy, setPolicy] = useState(null);
  const [holdName, setHoldName] = useState("Investigation hold");
  const [subjectUserId, setSubjectUserId] = useState("");
  const selectedOrg = useMemo(() => organizations.find((org) => org._id === activeOrgId), [organizations, activeOrgId]);

  useEffect(() => {
    if (data?.policy) setPolicy(data.policy);
  }, [data?.policy]);

  const updatePolicy = (section, key, value) => {
    setPolicy((current) => ({ ...current, [section]: { ...(current?.[section] || {}), [key]: value } }));
  };

  if (!activeOrgId && !isLoading) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold text-gray-900">Compliance</h1>
        <p className="text-sm text-gray-500 mt-1">Create or join an organization before configuring compliance controls.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Governance, privacy, retention, exports, and legal holds</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      {isLoading || !policy ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Legal Holds" value={data?.legalHolds?.filter((hold) => hold.status === "active").length} />
            <Metric label="Exports" value={data?.exports?.length} />
            <Metric label="Consent Events" value={data?.consentEvents?.length} />
            <Metric label="Reports" value={data?.reports?.length} />
          </div>

          <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileCheck2 className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">{selectedOrg?.name || "Organization"} Governance Policy</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Toggle label="Personal data export" checked={policy.gdpr.allowPersonalDataExport} onChange={(value) => updatePolicy("gdpr", "allowPersonalDataExport", value)} />
                <Toggle label="Personal data deletion" checked={policy.gdpr.allowPersonalDataDeletion} onChange={(value) => updatePolicy("gdpr", "allowPersonalDataDeletion", value)} />
                <Toggle label="Anonymize instead of delete" checked={policy.gdpr.anonymizeInsteadOfDelete} onChange={(value) => updatePolicy("gdpr", "anonymizeInsteadOfDelete", value)} />
                <Toggle label="Deletion review required" checked={policy.gdpr.deletionReviewRequired} onChange={(value) => updatePolicy("gdpr", "deletionReviewRequired", value)} />
                <Toggle label="Marketing consent required" checked={policy.privacy.requireMarketingConsent} onChange={(value) => updatePolicy("privacy", "requireMarketingConsent", value)} />
                <Toggle label="Data sharing opt-out" checked={policy.privacy.allowDataSharingOptOut} onChange={(value) => updatePolicy("privacy", "allowDataSharingOptOut", value)} />
              </div>
              <div className="grid md:grid-cols-4 gap-3 mt-4">
                <label className="text-sm text-gray-600">
                  Audit days
                  <input className="input mt-1" type="number" value={policy.retention.auditLogRetentionDays} onChange={(event) => updatePolicy("retention", "auditLogRetentionDays", Number(event.target.value))} />
                </label>
                <label className="text-sm text-gray-600">
                  Order days
                  <input className="input mt-1" type="number" value={policy.retention.orderRetentionDays} onChange={(event) => updatePolicy("retention", "orderRetentionDays", Number(event.target.value))} />
                </label>
                <label className="text-sm text-gray-600">
                  License days
                  <input className="input mt-1" type="number" value={policy.retention.licenseRetentionDays} onChange={(event) => updatePolicy("retention", "licenseRetentionDays", Number(event.target.value))} />
                </label>
                <label className="text-sm text-gray-600">
                  Notification days
                  <input className="input mt-1" type="number" value={policy.retention.notificationRetentionDays} onChange={(event) => updatePolicy("retention", "notificationRetentionDays", Number(event.target.value))} />
                </label>
              </div>
              <button className="btn-primary mt-4" disabled={action.isPending} onClick={() => action.mutate({ action: "policy", organizationId: activeOrgId, body: policy })}>
                Save Policy
              </button>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Data Export</h2>
              </div>
              <div className="space-y-3">
                <input className="input" value={subjectUserId} onChange={(event) => setSubjectUserId(event.target.value)} placeholder="Optional subject user ID" />
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" disabled={action.isPending} onClick={() => action.mutate({ action: "export", organizationId: activeOrgId, body: { format: "json", subjectUserId: subjectUserId || undefined } })}>JSON Export</button>
                  <button className="btn-secondary" disabled={action.isPending} onClick={() => action.mutate({ action: "export", organizationId: activeOrgId, body: { format: "csv", subjectUserId: subjectUserId || undefined } })}>CSV Export</button>
                </div>
                <button className="btn-secondary w-full" disabled={!subjectUserId || action.isPending} onClick={() => action.mutate({ action: "anonymize", organizationId: activeOrgId, userId: subjectUserId })}>
                  <UserX className="w-4 h-4" /> Anonymize Subject
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Archive className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Retention Preview</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                <Metric label="Audit Logs" value={data?.retentionPreview?.auditLogs} />
                <Metric label="Orders" value={data?.retentionPreview?.orders} />
                <Metric label="Licenses" value={data?.retentionPreview?.licenses} />
                <Metric label="Notifications" value={data?.retentionPreview?.notifications} />
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Reports</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.reports || []).map((report) => (
                  <div key={report.type} className="px-5 py-4">
                    <p className="font-medium text-gray-900 capitalize">{report.type.replace(/_/g, " ")}</p>
                    <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Gavel className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Legal Holds</h2>
              </div>
              <div className="p-5 flex gap-2 border-b border-gray-100">
                <input className="input" value={holdName} onChange={(event) => setHoldName(event.target.value)} />
                <button className="btn-primary" disabled={!holdName || action.isPending} onClick={() => action.mutate({ action: "hold", organizationId: activeOrgId, body: { name: holdName, protectedResources: ["all"] } })}>Enable</button>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.legalHolds || []).map((hold) => (
                  <div key={hold._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{hold.name}</p>
                      <p className="text-xs text-gray-500">{(hold.protectedResources || []).join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={hold.status} />
                      {hold.status === "active" && <button className="btn-secondary btn-sm" onClick={() => action.mutate({ action: "release-hold", organizationId: activeOrgId, holdId: hold._id })}>Release</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Recent Exports</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.exports || []).length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No exports yet.</p>}
                {(data?.exports || []).map((item) => (
                  <div key={item._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.format?.toUpperCase()} export</p>
                      <p className="text-xs text-gray-500">{Object.values(item.rowCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0)} rows</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
