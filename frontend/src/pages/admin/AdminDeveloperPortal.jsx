import { useMemo, useState } from "react";
import { BookOpen, Braces, Code2, Loader2, Play, Search, ShieldCheck, Webhook } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useDeveloperPortal, useDeveloperSearch, useSandboxExecute } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminDeveloperPortal() {
  const { data, isLoading } = useDeveloperPortal();
  const [query, setQuery] = useState("");
  const [sandboxKey, setSandboxKey] = useState("");
  const [endpointId, setEndpointId] = useState("listProducts");
  const search = useDeveloperSearch(query);
  const sandbox = useSandboxExecute();
  const endpoints = useMemo(() => data?.docs?.endpoints || [], [data?.docs?.endpoints]);
  const selectedEndpoint = useMemo(() => endpoints.find((item) => item.id === endpointId) || endpoints[0], [endpoints, endpointId]);

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
        <h1 className="text-2xl font-bold text-gray-900">Developer Portal</h1>
        <p className="text-sm text-gray-500 mt-0.5">API documentation, SDKs, webhooks, and sandbox tooling</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Endpoints" value={data?.overview?.endpoints} />
        <Metric label="Webhook Events" value={data?.overview?.webhookEvents} />
        <Metric label="SDKs" value={data?.overview?.sdkCount} />
        <Metric label="Errors" value={data?.overview?.errorCodes} />
        <Metric label="API Version" value={data?.overview?.apiVersion === "v1" ? 1 : 0} />
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Documentation Search</h2>
        </div>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search endpoints, resources, errors, webhooks, SDKs" />
        {query && (
          <div className="mt-4 divide-y divide-gray-100">
            {(search.data || []).map((item) => (
              <div key={`${item.type}-${item.key}`} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.text}</p>
                </div>
                <StatusBadge status={item.type} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">API Reference</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={endpoint.method} />
                  <p className="font-mono text-sm text-gray-900">{endpoint.path}</p>
                  {endpoint.scope && <span className="text-xs text-gray-400">{endpoint.scope}</span>}
                </div>
                <p className="text-sm text-gray-500 mt-2">{endpoint.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Play className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Sandbox Explorer</h2>
          </div>
          <div className="space-y-3">
            <select className="input" value={endpointId} onChange={(event) => setEndpointId(event.target.value)}>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>{endpoint.method} {endpoint.path}</option>
              ))}
            </select>
            <input className="input font-mono" type="password" value={sandboxKey} onChange={(event) => setSandboxKey(event.target.value)} placeholder="pl_test_..." />
            <button
              type="button"
              className="btn-primary"
              disabled={!selectedEndpoint || sandbox.isPending}
              onClick={() => sandbox.mutate({ apiKey: sandboxKey, endpointId: selectedEndpoint.id, method: selectedEndpoint.method })}
            >
              {sandbox.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Execute Mock Request
            </button>
            <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-auto min-h-40">
              {JSON.stringify(sandbox.data || selectedEndpoint?.exampleResponse || {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">SDK Center</h2>
          </div>
          <div className="space-y-3">
            {(data?.sdks || []).map((sdk) => (
              <div key={sdk.language} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-800">{sdk.language}</span>
                <StatusBadge status={sdk.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Webhook className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Webhook Events</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(data?.docs?.webhooks || []).slice(0, 18).map((event) => (
              <span key={event.name} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{event.name}</span>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Errors & Limits</h2>
          </div>
          <div className="space-y-2">
            {(data?.docs?.errors || []).slice(0, 6).map((error) => (
              <div key={error.code} className="text-sm">
                <p className="font-mono text-gray-800">{error.code}</p>
                <p className="text-xs text-gray-500">{error.resolution}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Braces className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">OpenAPI & Postman</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="rounded border border-gray-100 p-4">
            <p className="font-medium text-gray-900">OpenAPI</p>
            <p className="text-gray-500 mt-1">{data?.openapi?.openapi} · {Object.keys(data?.openapi?.paths || {}).length} paths</p>
          </div>
          <div className="rounded border border-gray-100 p-4">
            <p className="font-medium text-gray-900">Postman Collection</p>
            <p className="text-gray-500 mt-1">Generated from live endpoint metadata</p>
          </div>
          <div className="rounded border border-gray-100 p-4">
            <p className="font-medium text-gray-900">Changelog</p>
            <p className="text-gray-500 mt-1">{data?.docs?.changelog?.[0]?.notes}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
