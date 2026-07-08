import { GitBranch, GitFork, Loader2, Play, ShieldCheck, UploadCloud } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useReleaseAutomation, useReleaseAutomationAction } from "../../hooks/useVersions";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminReleaseAutomation() {
  const { data, isLoading } = useReleaseAutomation();
  const action = useReleaseAutomationAction();
  const repositories = data?.repositories || [];
  const pipelines = data?.pipelines || [];
  const stats = data?.stats || {};

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
        <h1 className="text-2xl font-bold text-gray-900">Release Automation</h1>
        <p className="text-sm text-gray-500 mt-0.5">GitHub and CI/CD release lifecycle foundation</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Repositories" value={stats.repositories} />
        <Metric label="Connected" value={stats.connected} />
        <Metric label="Pipelines" value={stats.pipelines} />
        <Metric label="Ready" value={stats.ready} />
        <Metric label="Failed Validation" value={stats.failed} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <GitFork className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Repositories</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {repositories.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No repositories connected yet.</p>}
          {repositories.map((repo) => (
            <div key={repo._id} className="grid lg:grid-cols-[1fr_180px_160px] gap-4 px-5 py-4 items-center">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{repo.owner}/{repo.repo}</p>
                  <StatusBadge status={repo.status} />
                </div>
                <p className="text-sm text-gray-500 mt-1">{repo.repositoryUrl}</p>
                <p className="text-xs text-gray-400 mt-1">Default branch: {repo.defaultBranch}</p>
              </div>
              <div className="text-sm text-gray-500">
                <p>Health: {repo.health?.status || "unknown"}</p>
                <p className="text-xs text-gray-400">{repo.lastSyncAt ? new Date(repo.lastSyncAt).toLocaleString() : "Never synced"}</p>
              </div>
              <button
                type="button"
                className="btn-secondary text-sm justify-center"
                disabled={action.isPending}
                onClick={() => action.mutate({ type: "health", id: repo._id })}
              >
                <ShieldCheck className="w-4 h-4" /> Check
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Release Pipelines</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {["Release", "Product", "Channel", "Pipeline", "Import", "Validation", "Build", "Actions"].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {pipelines.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-6 text-sm text-gray-500">No release pipelines imported yet.</td></tr>
              )}
              {pipelines.map((pipeline) => (
                <tr key={pipeline._id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{pipeline.releaseTag}</p>
                    <p className="text-xs text-gray-500">{pipeline.releaseTitle || "Untitled release"}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{pipeline.productId?.name || "Product"}</td>
                  <td className="px-5 py-4"><StatusBadge status={pipeline.releaseChannel} /></td>
                  <td className="px-5 py-4"><StatusBadge status={pipeline.status} /></td>
                  <td className="px-5 py-4"><StatusBadge status={pipeline.importStatus} /></td>
                  <td className="px-5 py-4"><StatusBadge status={pipeline.validationStatus} /></td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    <p>{pipeline.build?.branch || "branch pending"}</p>
                    <p className="font-mono">{pipeline.build?.commitSha?.slice(0, 10) || "commit pending"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ type: "validate", id: pipeline._id })}
                    >
                      <Play className="w-4 h-4" /> Validate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <UploadCloud className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Provider Foundation</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(data?.providers || []).map((provider) => (
            <span key={provider.id} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
              {provider.name}: {provider.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
