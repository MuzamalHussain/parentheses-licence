import { useEffect, useMemo, useState } from "react";
import { Fingerprint, KeyRound, Loader2, Plus, RotateCcw, ShieldCheck, Smartphone, Users } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminIdentity, useIdentityAction } from "../../hooks/useLicenses";

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

export default function AdminIdentity() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminIdentity(activeOrgId);
  const action = useIdentityAction();
  const [provider, setProvider] = useState({ name: "Okta", provider: "okta", protocol: "oidc", configuration: { clientId: "", issuerUrl: "" } });
  const [policy, setPolicy] = useState(null);
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
        <h1 className="text-xl font-bold text-gray-900">Enterprise Identity</h1>
        <p className="text-sm text-gray-500 mt-1">Create or join an organization before configuring identity policies.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enterprise Identity</h1>
          <p className="text-sm text-gray-500 mt-0.5">SSO, MFA, sessions, and organization security policies</p>
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
            <Metric label="Identity Providers" value={data?.providers?.length} />
            <Metric label="Active Sessions" value={data?.sessions?.length} />
            <Metric label="MFA Users" value={data?.mfa?.enabledUsers} />
            <Metric label="Recent Events" value={data?.recentEvents?.length} />
          </div>

          <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">{selectedOrg?.name || "Organization"} Security Policy</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Toggle label="Require MFA" checked={policy.mfa.required} onChange={(value) => updatePolicy("mfa", "required", value)} />
                <Toggle label="Allow local login" checked={policy.authentication.localLoginAllowed} onChange={(value) => updatePolicy("authentication", "localLoginAllowed", value)} />
                <Toggle label="Allow social login" checked={policy.authentication.socialLoginAllowed} onChange={(value) => updatePolicy("authentication", "socialLoginAllowed", value)} />
                <Toggle label="SSO required" checked={policy.authentication.ssoRequired} onChange={(value) => updatePolicy("authentication", "ssoRequired", value)} />
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <label className="text-sm text-gray-600">
                  Session lifetime
                  <input className="input mt-1" type="number" value={policy.sessions.lifetimeMinutes} onChange={(event) => updatePolicy("sessions", "lifetimeMinutes", Number(event.target.value))} />
                </label>
                <label className="text-sm text-gray-600">
                  Idle timeout
                  <input className="input mt-1" type="number" value={policy.sessions.idleTimeoutMinutes} onChange={(event) => updatePolicy("sessions", "idleTimeoutMinutes", Number(event.target.value))} />
                </label>
                <label className="text-sm text-gray-600">
                  Password minimum
                  <input className="input mt-1" type="number" value={policy.password.minLength} onChange={(event) => updatePolicy("password", "minLength", Number(event.target.value))} />
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <Toggle label="Require lowercase" checked={policy.password.requireLowercase} onChange={(value) => updatePolicy("password", "requireLowercase", value)} />
                <Toggle label="Require uppercase" checked={policy.password.requireUppercase} onChange={(value) => updatePolicy("password", "requireUppercase", value)} />
                <Toggle label="Require number" checked={policy.password.requireNumber} onChange={(value) => updatePolicy("password", "requireNumber", value)} />
                <Toggle label="Require symbol" checked={policy.password.requireSymbol} onChange={(value) => updatePolicy("password", "requireSymbol", value)} />
              </div>
              <button
                className="btn-primary mt-4"
                disabled={action.isPending}
                onClick={() => action.mutate({ action: "policy", organizationId: activeOrgId, body: policy })}
              >
                Save Policy
              </button>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Add Provider</h2>
              </div>
              <div className="space-y-3">
                <input className="input" value={provider.name} onChange={(event) => setProvider({ ...provider, name: event.target.value })} placeholder="Provider name" />
                <select className="input" value={provider.provider} onChange={(event) => setProvider({ ...provider, provider: event.target.value, protocol: event.target.value === "saml" || event.target.value === "onelogin" ? "saml2" : "oidc" })}>
                  {(data?.supportedProviders || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
                <input className="input" value={provider.configuration.clientId} onChange={(event) => setProvider({ ...provider, configuration: { ...provider.configuration, clientId: event.target.value } })} placeholder="Client ID or entity ID" />
                <input className="input" value={provider.configuration.issuerUrl} onChange={(event) => setProvider({ ...provider, configuration: { ...provider.configuration, issuerUrl: event.target.value } })} placeholder="Issuer URL" />
                <button className="btn-primary w-full" disabled={action.isPending} onClick={() => action.mutate({ action: "provider", organizationId: activeOrgId, body: provider })}>
                  Save Provider
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Identity Providers</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {(data?.providers || []).length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No providers configured yet.</p>}
                {(data?.providers || []).map((item) => (
                  <div key={item._id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.provider} · {item.protocol}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <button className="btn-secondary btn-sm" onClick={() => action.mutate({ action: "provider-test", organizationId: activeOrgId, providerId: item._id })}>Test</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Sessions</h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {(data?.sessions || []).length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No active organization sessions found.</p>}
                {(data?.sessions || []).map((session) => (
                  <div key={`${session.user?.id}-${session.sessionId}`} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{session.user?.name || "User"}</p>
                      <p className="text-xs text-gray-500">{session.browser} · {session.operatingSystem} · {session.ipAddress}</p>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => action.mutate({ action: "revoke-session", organizationId: activeOrgId, userId: session.user?.id, sessionId: session.sessionId })}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">SCIM Foundation</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <Toggle label="SCIM enabled" checked={policy.scim.enabled} onChange={(value) => updatePolicy("scim", "enabled", value)} />
              <Toggle label="Group sync" checked={policy.scim.groupSyncEnabled} onChange={(value) => updatePolicy("scim", "groupSyncEnabled", value)} />
              <input className="input" value={policy.scim.baseUrl || ""} onChange={(event) => updatePolicy("scim", "baseUrl", event.target.value)} placeholder="SCIM base URL" />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Recent Identity Events</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {(data?.recentEvents || []).map((event) => (
                <div key={event._id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-mono text-gray-700">{event.action}</p>
                  <p className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
