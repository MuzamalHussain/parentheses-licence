const performanceConfig = require("../../config/performance");

const slowApis = [];
const slowDatabaseQueries = [];
const slowAiRequests = [];
const slowQueueJobs = [];
const slowWebhooks = [];
const largePayloads = [];

function boundedPush(list, item, max = 100) {
  list.push({ ...item, ts: item.ts || new Date().toISOString() });
  while (list.length > max) list.shift();
}

function threshold(type) {
  return performanceConfig.budgets?.[type] || 750;
}

function recordApi({ method, path, statusCode, durationMs, requestBytes = 0, responseBytes = 0, requestId }) {
  if (durationMs >= threshold("apiResponseMs")) {
    boundedPush(slowApis, { method, path, statusCode, durationMs: Math.round(durationMs), requestBytes, responseBytes, requestId });
  }
  if (responseBytes >= (performanceConfig.payloads?.largeResponseBytes || 250_000)) {
    boundedPush(largePayloads, { method, path, responseBytes, requestId, type: "response" });
  }
  if (requestBytes >= (performanceConfig.payloads?.largeRequestBytes || 250_000)) {
    boundedPush(largePayloads, { method, path, requestBytes, requestId, type: "request" });
  }
}

function recordDatabaseQuery(query) {
  if (Number(query.durationMs || 0) >= threshold("databaseQueryMs")) {
    boundedPush(slowDatabaseQueries, query);
  }
}

function recordAiRequest(request) {
  if (Number(request.durationMs || 0) >= threshold("aiRequestMs")) boundedPush(slowAiRequests, request);
}

function recordQueueJob(job) {
  if (Number(job.durationMs || 0) >= threshold("queueJobMs")) boundedPush(slowQueueJobs, job);
}

function recordWebhook(webhook) {
  if (Number(webhook.durationMs || 0) >= threshold("webhookMs")) boundedPush(slowWebhooks, webhook);
}

function snapshot() {
  return {
    budgets: performanceConfig.budgets,
    slowApis: [...slowApis],
    slowDatabaseQueries: [...slowDatabaseQueries],
    slowAiRequests: [...slowAiRequests],
    slowQueueJobs: [...slowQueueJobs],
    slowWebhooks: [...slowWebhooks],
    largePayloads: [...largePayloads],
  };
}

function resetForTests() {
  slowApis.length = 0;
  slowDatabaseQueries.length = 0;
  slowAiRequests.length = 0;
  slowQueueJobs.length = 0;
  slowWebhooks.length = 0;
  largePayloads.length = 0;
}

module.exports = { recordAiRequest, recordApi, recordDatabaseQuery, recordQueueJob, recordWebhook, resetForTests, snapshot };
