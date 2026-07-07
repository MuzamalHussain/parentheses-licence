const OperationsState = require("../../models/OperationsState");
const WorkflowEngine = require("../workflows/WorkflowEngine");
const AnalyticsCache = require("../analytics/AnalyticsCacheService");
const { getCached, clearCache } = require("../../utils/ttlCache");
const { writeAuditLog } = require("../../utils/auditLog");
const HealthAggregator = require("./HealthAggregator");
const performanceConfig = require("../../config/performance");
const { getConfig } = require("../../config/env");

async function getRuntimeState() {
  const config = getConfig();
  const state = await OperationsState.findOne({ key: "global" }).lean().catch(() => null);
  return {
    maintenanceMode: Boolean(state?.maintenanceMode || config.operations.maintenanceMode),
    readOnlyMode: Boolean(state?.readOnlyMode || config.operations.readOnlyMode),
    emergencyShutdown: Boolean(config.operations.emergencyShutdown),
    source: state ? "runtime" : "environment",
    lastAction: state?.lastAction || "",
    lastActionAt: state?.lastActionAt || null,
  };
}

async function getDashboard({ force = false } = {}) {
  const factory = async () => {
    const [
      systemHealth,
      queue,
      email,
      payments,
      licenseServer,
      database,
    ] = await Promise.all([
      HealthAggregator.getSystemHealth(),
      HealthAggregator.getQueueMonitor(),
      HealthAggregator.getEmailMonitor(),
      HealthAggregator.getPaymentMonitor(),
      HealthAggregator.getLicenseServerMonitor(),
      HealthAggregator.getDatabaseHealth(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      systemHealth,
      queue,
      email,
      payments,
      licenseServer,
      api: HealthAggregator.getApiMonitor(),
      database,
      errors: HealthAggregator.getErrorCenter(),
      maintenance: await getRuntimeState(),
    };
  };

  if (force) return factory();
  return getCached("operations:dashboard:v1", performanceConfig.cache.dashboardTtlMs, factory);
}

async function auditOperation({ actor, action, metadata = {}, ip = "", requestId = "" }) {
  await writeAuditLog({
    actor,
    action,
    targetType: "Operations",
    metadata,
    ip,
    requestId,
  });
}

async function setMaintenanceState({ maintenanceMode, readOnlyMode, actor, ip, requestId }) {
  const patch = {
    ...(typeof maintenanceMode === "boolean" ? { maintenanceMode } : {}),
    ...(typeof readOnlyMode === "boolean" ? { readOnlyMode } : {}),
    lastAction: "operations.maintenance_updated",
    lastActionAt: new Date(),
    lastActionBy: actor?._id || null,
  };
  const state = await OperationsState.findOneAndUpdate(
    { key: "global" },
    { $set: patch, $setOnInsert: { key: "global" } },
    { new: true, upsert: true }
  ).lean();
  clearCache("operations:");
  await auditOperation({ actor, action: "operations.maintenance_updated", metadata: patch, ip, requestId });
  return state;
}

async function clearOperationsCache({ actor, ip, requestId }) {
  clearCache("");
  await auditOperation({ actor, action: "operations.cache_cleared", ip, requestId });
  return { cleared: true };
}

async function restartJobs({ actor, ip, requestId }) {
  const result = await WorkflowEngine.processDueJobs({ limit: 25 });
  clearCache("operations:");
  await auditOperation({ actor, action: "operations.jobs_restarted", metadata: result, ip, requestId });
  return result;
}

async function rebuildAnalytics({ actor, ip, requestId }) {
  if (AnalyticsCache?.cacheKey) clearCache("analytics:");
  clearCache("admin:dashboard:");
  clearCache("operations:");
  await auditOperation({ actor, action: "operations.analytics_rebuild_requested", ip, requestId });
  return { queued: false, cacheCleared: true };
}

async function runMaintenanceAction({ action, body = {}, actor, ip, requestId }) {
  if (action === "set-maintenance") {
    return setMaintenanceState({ ...body, actor, ip, requestId });
  }
  if (action === "clear-cache") return clearOperationsCache({ actor, ip, requestId });
  if (action === "restart-jobs") return restartJobs({ actor, ip, requestId });
  if (action === "rebuild-analytics") return rebuildAnalytics({ actor, ip, requestId });
  throw new Error("Unsupported maintenance action.");
}

module.exports = {
  getDashboard,
  getRuntimeState,
  runMaintenanceAction,
};
