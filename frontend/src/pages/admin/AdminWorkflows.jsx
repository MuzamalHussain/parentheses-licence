import { Loader2, Workflow, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminWorkflowJobs, useAdminWorkflowOverview } from "../../hooks/useLicenses";

function Metric({ label, value, icon: Icon, tone }) {
  return (
    <div className="card p-4">
      <div className={`inline-flex p-2 rounded-lg ${tone} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminWorkflows() {
  const [params] = useSearchParams();
  const status = params.get("status") || "";
  const { data: overview, isLoading: overviewLoading } = useAdminWorkflowOverview();
  const { data: jobs, isLoading: jobsLoading } = useAdminWorkflowJobs({ status: status || undefined, limit: 25 });
  const stats = overview?.stats || {};

  if (overviewLoading || jobsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Automation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Workflow jobs and retry queue</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Pending Jobs" value={stats.pending} icon={Clock} tone="text-cyan-700 bg-cyan-50" />
        <Metric label="Running Jobs" value={stats.running} icon={Workflow} tone="text-sky-700 bg-sky-50" />
        <Metric label="Completed Jobs" value={stats.completed} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50" />
        <Metric label="Failed Jobs" value={stats.failed} icon={AlertTriangle} tone="text-red-700 bg-red-50" />
        <Metric label="Retry Queue" value={stats.retryQueue} icon={RefreshCw} tone="text-orange-700 bg-orange-50" />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Workflow Jobs</h2>
          <span className="text-xs text-gray-400">{jobs?.total || 0} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {jobs?.items?.length ? jobs.items.map((job) => (
                <tr key={job._id}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{job.workflowName}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{job.eventName}</td>
                  <td className="px-5 py-3"><StatusBadge status={job.status} /></td>
                  <td className="px-5 py-3 text-sm text-gray-500">{job.attempts || 0}/{job.maxAttempts || 0}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(job.nextRunAt)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-5 py-8 text-center text-sm text-gray-400">No workflow jobs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
