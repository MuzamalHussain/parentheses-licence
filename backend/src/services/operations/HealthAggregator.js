const mongoose = require("mongoose");
const AuditLog = require("../../models/AuditLog");
const Download = require("../../models/Download");
const LicenseActivation = require("../../models/LicenseActivation");
const LicenseSite = require("../../models/LicenseSite");
const Payment = require("../../models/Payment");
const WebhookEvent = require("../../models/WebhookEvent");
const WorkflowEngine = require("../workflows/WorkflowEngine");
const { getSystemDiagnostics } = require("../diagnosticsService");
const { getMetricsSnapshot } = require("../metricsService");
const { getPaymentProviderStatuses } = require("../paymentProviderStatus");

const SINCE_24H = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

async function safeCount(model, filter = {}) {
  try {
    return await model.countDocuments(filter);
  } catch {
    return 0;
  }
}

async function safeAggregate(model, pipeline = []) {
  try {
    return await model.aggregate(pipeline);
  } catch {
    return [];
  }
}

function countsFromRows(rows, defaults = {}) {
  return rows.reduce((acc, row) => {
    acc[row._id || "unknown"] = row.count;
    return acc;
  }, { ...defaults });
}

async function getDatabaseHealth() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;
  const collections = [];
  let storageUsage = null;

  if (connected && mongoose.connection.db) {
    try {
      const names = await mongoose.connection.db.listCollections().toArray();
      collections.push(...names.map((collection) => collection.name).sort());
      storageUsage = await mongoose.connection.db.stats();
    } catch {
      storageUsage = null;
    }
  }

  return {
    connectionStatus: connected ? "connected" : "degraded",
    readyState,
    collections,
    collectionCount: collections.length,
    storageUsage: storageUsage ? {
      dataSize: storageUsage.dataSize || 0,
      storageSize: storageUsage.storageSize || 0,
      indexSize: storageUsage.indexSize || 0,
    } : null,
    slowQueryFoundation: true,
  };
}

async function getQueueMonitor() {
  return WorkflowEngine.stats();
}

async function getEmailMonitor() {
  const rows = await safeAggregate(AuditLog, [
    { $match: { action: { $in: ["notification.sent", "notification.failed", "notification.retried"] }, createdAt: { $gte: SINCE_24H() } } },
    { $group: { _id: "$action", count: { $sum: 1 } } },
  ]);
  const counts = countsFromRows(rows, {
    "notification.sent": 0,
    "notification.failed": 0,
    "notification.retried": 0,
  });
  const workflowStats = await getQueueMonitor();
  return {
    sent: counts["notification.sent"],
    pending: workflowStats.pending,
    failed: counts["notification.failed"],
    retries: counts["notification.retried"],
  };
}

async function getPaymentMonitor() {
  const [paymentRows, webhookRows] = await Promise.all([
    safeAggregate(Payment, [{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    safeAggregate(WebhookEvent, [{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const payments = countsFromRows(paymentRows, { pending: 0, failed: 0, refunded: 0, partially_refunded: 0 });
  const webhooks = countsFromRows(webhookRows, { processing: 0, processed: 0, failed: 0 });
  return {
    gateways: getPaymentProviderStatuses(),
    webhookQueue: webhooks.processing,
    failedPayments: payments.failed,
    refundQueue: payments.refunded + payments.partially_refunded,
    webhooks,
    payments,
  };
}

async function getLicenseServerMonitor() {
  const since = SINCE_24H();
  const [validations, failedValidations, activations, heartbeats] = await Promise.all([
    safeCount(AuditLog, { action: { $in: ["license.validation", "license.validated"] }, createdAt: { $gte: since } }),
    safeCount(AuditLog, { action: { $in: ["license.validation_failed", "wordpress_update.denied"] }, createdAt: { $gte: since } }),
    safeCount(LicenseActivation, { action: "activate", createdAt: { $gte: since } }),
    safeCount(LicenseSite, { lastHeartbeatAt: { $gte: since } }),
  ]);

  return {
    validationRequests: validations,
    activationRequests: activations,
    heartbeatRequests: heartbeats,
    failedValidations,
  };
}

function getApiMonitor() {
  const metrics = getMetricsSnapshot();
  const routes = metrics.http.routes || [];
  return {
    totalRequests: metrics.http.requestCount,
    averageResponseTime: metrics.http.avgDurationMs,
    slowEndpoints: routes
      .filter((route) => route.avgDurationMs > 0)
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, 8),
    recentErrors: metrics.errors.recent,
    maxResponseTime: metrics.http.maxDurationMs,
  };
}

function getErrorCenter() {
  const metrics = getMetricsSnapshot();
  return metrics.errors.recent.map((error) => ({
    severity: Number(error.statusCode || 500) >= 500 ? "critical" : "warning",
    source: error.source || "app",
    timestamp: error.ts,
    message: error.message,
    requestId: error.requestId,
    resolutionStatus: "open",
  }));
}

async function getSystemHealth() {
  const diagnostics = await getSystemDiagnostics({ verifySmtp: false });
  const paymentProviders = getPaymentProviderStatuses();
  return {
    status: diagnostics.status,
    api: { status: "ok", ok: true },
    database: diagnostics.checks.database,
    storage: diagnostics.checks.storage,
    notifications: diagnostics.checks.smtp,
    payments: {
      status: paymentProviders.some((provider) => provider.enabled && !provider.operational) ? "degraded" : "ok",
      providers: paymentProviders,
    },
    licenseServer: {
      status: diagnostics.checks.database.ok ? "ok" : "degraded",
      updaterEnabled: diagnostics.checks.operations?.environment?.ok !== false,
    },
  };
}

module.exports = {
  getSystemHealth,
  getQueueMonitor,
  getEmailMonitor,
  getPaymentMonitor,
  getLicenseServerMonitor,
  getApiMonitor,
  getDatabaseHealth,
  getErrorCenter,
};
