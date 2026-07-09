import { Activity, Boxes, Database, HardDrive, Layers3, Loader2, Network, Server } from "lucide-react";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAdminInfrastructureDashboard } from "../../hooks/useLicenses";

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

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value || 0}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminInfrastructure() {
  const { data, isLoading } = useAdminInfrastructureDashboard();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const capacity = data?.capacity || {};
  const queue = data?.queue || {};
  const health = data?.health || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Infrastructure Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">High availability, service health, capacity, queue isolation, storage, and cache readiness</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric label="Platform Status" value={health.status || "-"} />
        <Metric label="CPU %" value={capacity.cpu?.percent || 0} />
        <Metric label="Memory RSS MB" value={capacity.memory?.rssMb || 0} />
        <Metric label="Queue Pending" value={capacity.queueDepth?.pending || 0} />
        <Metric label="Avg Response MS" value={capacity.requestThroughput?.averageResponseTimeMs || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <Panel title="Service Status" icon={Server}>
            <div className="grid md:grid-cols-2 gap-3">
              {(health.services || []).map((service) => (
                <div key={service.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{service.name}</p>
                    <p className="text-xs text-gray-500">{service.type} {service.critical ? "- critical" : ""}</p>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Capacity Overview" icon={Activity}>
            <div className="grid md:grid-cols-4 gap-4">
              <Metric label="Total Requests" value={capacity.requestThroughput?.totalRequests || 0} />
              <Metric label="Slow Requests" value={capacity.requestThroughput?.slowRequests || 0} />
              <Metric label="System Free MB" value={capacity.memory?.freeSystemMb || 0} />
              <Metric label="Concurrent Sessions" value={capacity.concurrentSessions?.activeSessions || 0} />
            </div>
          </Panel>

          <Panel title="Queue Status" icon={Boxes}>
            <div className="grid md:grid-cols-3 gap-3">
              {(queue.workers || []).map((worker) => (
                <div key={worker.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-900">{worker.id}</p>
                  <p className="text-xs text-gray-500">{worker.queue}</p>
                  <p className="text-xs text-gray-400 mt-1">Concurrency {worker.concurrency}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Distributed Architecture" icon={Network}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Stateless API: {data?.architecture?.statelessApi ? "ready" : "pending"}</p>
              <p>Horizontal scaling: {data?.architecture?.horizontalScalingReady ? "ready" : "pending"}</p>
              <p>Multiple instances: {data?.architecture?.multipleApiInstances ? "ready" : "pending"}</p>
              <p>Shared sessions: {data?.architecture?.sharedSessions}</p>
            </div>
          </Panel>

          <Panel title="Cache Layer" icon={Layers3}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Backend: {data?.cache?.backend}</p>
              <p>Redis connected: {data?.cache?.redisConnected ? "yes" : "no"}</p>
              {(data?.cache?.capabilities || []).map((item) => <p key={item}>{item}</p>)}
            </div>
          </Panel>

          <Panel title="Storage Foundation" icon={HardDrive}>
            <p className="text-sm text-gray-600">Active: {data?.storage?.activeProvider}</p>
            <div className="mt-3 space-y-2">
              {(data?.storage?.providers || []).map((provider) => (
                <div key={provider.id} className="flex items-center justify-between text-sm">
                  <span>{provider.name}</span>
                  <StatusBadge status={provider.configured ? "configured" : "ready"} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Database Scaling" icon={Database}>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Connection pooling: foundation</p>
              <p>Read replicas: foundation</p>
              <p>Replica set compatible: foundation</p>
              <p>Query hooks: foundation</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
