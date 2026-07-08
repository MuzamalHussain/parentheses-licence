import { CheckCircle2, Code2, Loader2, Plug, Power, RefreshCw, Webhook } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminIntegrations, useIntegrationAction } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminIntegrations() {
  const { data, isLoading } = useAdminIntegrations();
  const action = useIntegrationAction();
  const integrations = data?.integrations || [];
  const apiCapabilities = data?.api?.capabilities || [];
  const webhookEvents = data?.webhooks?.events || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Developer platform and provider foundation</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Installed" value={integrations.filter((item) => item.installed).length} />
        <Metric label="Enabled" value={integrations.filter((item) => item.enabled).length} />
        <Metric label="Webhook Events" value={webhookEvents.length} />
        <Metric label="API Capabilities" value={apiCapabilities.length} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Plug className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Installed Integrations</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {integrations.map((integration) => (
            <div key={integration.id} className="grid lg:grid-cols-[1fr_220px_220px] gap-4 px-5 py-4 items-center">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{integration.name}</p>
                  <StatusBadge status={integration.status} />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  v{integration.version} · {integration.capabilities.join(", ") || "No capabilities"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Last sync: {integration.lastSync ? new Date(integration.lastSync).toLocaleString() : "Never"}
                </p>
              </div>
              <div className="text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Health: {integration.health?.status || "unknown"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Webhook className="w-4 h-4" />
                  <span>{integration.configuration?.webhookConfigured ? "Webhook configured" : "Webhook pending"}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ providerId: integration.id, action: "test" })}
                >
                  <RefreshCw className="w-4 h-4" /> Test
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ providerId: integration.id, action: "enabled", body: { enabled: !integration.enabled } })}
                >
                  <Power className="w-4 h-4" /> {integration.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Webhook className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Outgoing Webhooks</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {webhookEvents.map((event) => (
              <span key={event} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{event}</span>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">API Capabilities</h2>
          </div>
          <div className="space-y-2">
            {apiCapabilities.map((capability) => (
              <div key={capability.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-gray-700">{capability.key}</span>
                <span className="text-gray-400">{capability.version}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
