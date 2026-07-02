const mongoose = require("mongoose");
const { getConfig } = require("../config/env");
const { getRedisClient, isRedisConnected } = require("../config/redis");
const { getNotificationQueue } = require("./notifications/queue");
const { verifyEmailProvider } = require("./notificationService");
const { getMetricsSnapshot } = require("./metricsService");
const { getCacheStats } = require("../utils/ttlCache");
const {
  validateProductionConfig,
  getBackupReadiness,
  getRestoreReadiness,
  getMaintenanceState,
} = require("./productionReadinessService");

const READY_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

function status(ok, details = {}) {
  return {
    status: ok ? "ok" : "degraded",
    ok,
    ...details,
  };
}

function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  return status(readyState === 1, {
    readyState,
    state: READY_STATES[readyState] || "unknown",
    host: mongoose.connection.host || "",
    name: mongoose.connection.name || "",
  });
}

function getRedisStatus() {
  const config = getConfig();
  if (!config.security.redisEnabled) {
    return status(true, { enabled: false, state: "disabled" });
  }
  const client = getRedisClient();
  return status(Boolean(client && isRedisConnected()), {
    enabled: true,
    state: client?.status || "unavailable",
  });
}

function getQueueStatus() {
  const queue = getNotificationQueue();
  return status(Boolean(queue), {
    name: queue?.name || "unknown",
    mode: queue?.name === "inline" ? "inline" : "external",
  });
}

function getStorageStatus() {
  const config = getConfig();
  return status(true, {
    provider: config.storage.provider,
    uploadRoot: config.storage.uploadRoot,
    pluginUploadDir: config.storage.pluginUploadDir,
    downloadsProvider: config.downloads.provider,
  });
}

function getEmailStatus() {
  const config = getConfig();
  return status(config.email.enabled, {
    enabled: config.email.enabled,
    provider: config.email.provider,
    hostConfigured: Boolean(config.email.host),
    fromConfigured: Boolean(config.email.from),
  });
}

async function getEmailVerificationStatus() {
  const base = getEmailStatus();
  if (!base.enabled) return base;
  const result = await verifyEmailProvider();
  return status(Boolean(result.success), {
    enabled: true,
    provider: result.provider,
    durationMs: result.durationMs,
    error: result.success ? undefined : result.error,
  });
}

async function getSystemDiagnostics({ verifySmtp = false } = {}) {
  const checks = {
    database: getDatabaseStatus(),
    storage: getStorageStatus(),
    smtp: verifySmtp ? await getEmailVerificationStatus() : getEmailStatus(),
    redis: getRedisStatus(),
    queue: getQueueStatus(),
    cache: status(true, getCacheStats()),
    operations: status(true, {
      environment: validateProductionConfig(),
      backup: getBackupReadiness(),
      restore: getRestoreReadiness(),
      maintenance: getMaintenanceState(),
    }),
  };
  const ready = checks.database.ok && checks.storage.ok && checks.redis.ok && checks.queue.ok;
  return {
    success: true,
    status: ready ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    metrics: getMetricsSnapshot(),
  };
}

async function getHealth({ readiness = false } = {}) {
  const diagnostics = await getSystemDiagnostics({ verifySmtp: false });
  const ok = readiness ? diagnostics.status === "ok" : true;
  return {
    success: ok,
    message: "API is running.",
    status: ok ? "ok" : diagnostics.status,
    checks: readiness ? diagnostics.checks : undefined,
    timestamp: diagnostics.timestamp,
  };
}

module.exports = {
  getDatabaseStatus,
  getRedisStatus,
  getQueueStatus,
  getStorageStatus,
  getEmailStatus,
  getSystemDiagnostics,
  getHealth,
};
