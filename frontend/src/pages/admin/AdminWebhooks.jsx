import { Loader2, Plus, Power, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminWebhooks, useCreateWebhook, useWebhookAction } from "../../hooks/useLicenses";

const DEFAULT_EVENTS = ["OrderCompleted", "PaymentSucceeded", "LicenseCreated"];

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminWebhooks() {
  const { data, isLoading } = useAdminWebhooks();
  const createWebhook = useCreateWebhook();
  const action = useWebhookAction();
  const [createdSecret, setCreatedSecret] = useState("");
  const endpoints = data?.endpoints || [];
  const deliveries = data?.deliveries?.items || [];
  const stats = data?.stats || {};

  const handleCreate = async () => {
    const result = await createWebhook.mutateAsync({
      name: "Developer Webhook",
      targetUrl: "https://example.com/webhooks/parentheses",
      subscribedEvents: DEFAULT_EVENTS,
      enabled: false,
    });
    setCreatedSecret(result.data?.secret || "");
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Event delivery and retries</p>
        </div>
        <button type="button" className="btn-primary" onClick={handleCreate} disabled={createWebhook.isPending}>
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {createdSecret && (
        <div className="card p-4 border-green-200 bg-green-50">
          <p className="text-sm font-medium text-green-800">Signing secret created. Store it now; it will not be shown again.</p>
          <p className="font-mono text-sm text-green-900 mt-2 break-all">{createdSecret}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Queued" value={stats.queued} />
        <Metric label="Sent" value={stats.sent} />
        <Metric label="Failed" value={stats.failed} />
        <Metric label="Retry Queue" value={stats.retryQueue} />
        <Metric label="Dead Letter" value={stats.dead_letter} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Configured Webhooks</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {endpoints.length ? endpoints.map((endpoint) => (
            <div key={endpoint._id} className="grid lg:grid-cols-[1fr_180px_220px] gap-4 px-5 py-4 items-center">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{endpoint.name}</p>
                  <StatusBadge status={endpoint.enabled ? "active" : "inactive"} />
                </div>
                <p className="text-sm text-gray-500 mt-1 truncate">{endpoint.targetUrl}</p>
                <p className="text-xs text-gray-400 mt-1">Events: {endpoint.subscribedEvents?.join(", ") || "None"}</p>
              </div>
              <div className="text-xs text-gray-500">
                <p>Last success: {endpoint.lastSuccessAt ? new Date(endpoint.lastSuccessAt).toLocaleString() : "Never"}</p>
                <p>Last failure: {endpoint.lastFailureAt ? new Date(endpoint.lastFailureAt).toLocaleString() : "Never"}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
                <button type="button" className="btn-secondary text-sm" disabled={action.isPending} onClick={() => action.mutate({ id: endpoint._id, action: "toggle", body: { enabled: !endpoint.enabled } })}>
                  <Power className="w-4 h-4" /> {endpoint.enabled ? "Disable" : "Enable"}
                </button>
                <button type="button" className="btn-secondary text-sm" disabled={action.isPending} onClick={() => action.mutate({ id: endpoint._id, action: "delete" })}>
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          )) : (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No webhooks configured.</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Delivery Logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retries</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {deliveries.length ? deliveries.map((delivery) => (
                <tr key={delivery._id}>
                  <td className="px-5 py-3 text-sm text-gray-900">{delivery.eventName}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 truncate max-w-xs">{delivery.endpointUrl}</td>
                  <td className="px-5 py-3"><StatusBadge status={delivery.status} /></td>
                  <td className="px-5 py-3 text-sm text-gray-500">{delivery.responseStatus || "-"}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{delivery.attempts || 0}/{delivery.maxAttempts || 0}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" className="btn-secondary text-sm" disabled={action.isPending || !["failed", "retrying", "dead_letter"].includes(delivery.status)} onClick={() => action.mutate({ id: delivery._id, action: "retry" })}>
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-sm text-gray-400">No deliveries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
