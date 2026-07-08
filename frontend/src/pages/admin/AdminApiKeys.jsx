import { Braces, KeyRound, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { useState } from "react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminApiKeys, useApiKeyAction, useCreateApiKey } from "../../hooks/useLicenses";

const DEFAULT_SCOPES = ["products.read", "licenses.read", "orders.read"];

export default function AdminApiKeys() {
  const { data: keys = [], isLoading } = useAdminApiKeys();
  const createKey = useCreateApiKey();
  const keyAction = useApiKeyAction();
  const [createdKey, setCreatedKey] = useState("");

  const handleCreate = async () => {
    const result = await createKey.mutateAsync({
      name: "Developer API Key",
      description: "Generated from admin dashboard.",
      environment: "sandbox",
      accessType: "read_only",
      keyType: "sandbox",
      scopes: DEFAULT_SCOPES,
    });
    setCreatedKey(result.data?.key || "");
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
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-0.5">Public REST API access</p>
        </div>
        <button type="button" className="btn-primary" onClick={handleCreate} disabled={createKey.isPending}>
          <KeyRound className="w-4 h-4" /> New Key
        </button>
      </div>

      {createdKey && (
        <div className="card p-4 border-green-200 bg-green-50">
          <p className="text-sm font-medium text-green-800">New key created. Store it now; it will not be shown again.</p>
          <p className="font-mono text-sm text-green-900 mt-2 break-all">{createdKey}</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Braces className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Keys</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scopes</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {keys.length ? keys.map((key) => (
                <tr key={key._id}>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{key.name}</p>
                    <p className="text-xs font-mono text-gray-400">{key.keyPrefix}...{key.keyLast4}</p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1 max-w-sm">
                      {key.scopes?.slice(0, 4).map((scope) => (
                        <span key={scope} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{scope}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={key.status} /></td>
                  <td className="px-5 py-3 text-sm text-gray-500">{Number(key.usageCount || 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary text-sm" disabled={keyAction.isPending || key.status === "revoked"} onClick={() => keyAction.mutate({ id: key._id, action: "rotate" })}>
                        <RefreshCw className="w-4 h-4" /> Rotate
                      </button>
                      <button type="button" className="btn-secondary text-sm" disabled={keyAction.isPending || key.status === "revoked"} onClick={() => keyAction.mutate({ id: key._id, action: "revoke" })}>
                        <ShieldOff className="w-4 h-4" /> Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-sm text-gray-400">No API keys yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
