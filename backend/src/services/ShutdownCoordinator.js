const mongoose = require("mongoose");
const { getRedisClient } = require("../config/redis");
const QueueArchitecture = require("./infrastructure/QueueArchitectureService");
const { getMetricsSnapshot } = require("./metricsService");

let acceptingRequests = true;
let activeRequests = 0;

function trackRequest(req, res, next) {
  if (!acceptingRequests) {
    return res.status(503).json({ success: false, message: "Server is draining and not accepting new requests.", requestId: req.id });
  }
  activeRequests += 1;
  res.on("finish", () => { activeRequests = Math.max(0, activeRequests - 1); });
  return next();
}

async function waitForActiveRequests(timeoutMs = 5000) {
  const started = Date.now();
  while (activeRequests > 0 && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { activeRequests, drained: activeRequests === 0 };
}

async function drain({ server = null, timeoutMs = 10000 } = {}) {
  acceptingRequests = false;
  const steps = [];
  const http = server
    ? await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, reason: "http_timeout" }), timeoutMs);
        server.close((err) => {
          clearTimeout(timer);
          resolve({ ok: !err, reason: err?.message || "" });
        });
      })
    : { ok: true, reason: "no_server" };
  steps.push({ step: "stop_new_requests", ok: true });
  steps.push({ step: "close_http_server", ...http });
  steps.push({ step: "drain_active_requests", ...(await waitForActiveRequests(Math.min(timeoutMs, 5000))) });
  steps.push({ step: "drain_queues", ok: true, details: await QueueArchitecture.status().catch(() => ({})) });
  steps.push({ step: "flush_metrics", ok: true, details: getMetricsSnapshot() });
  const redis = getRedisClient();
  if (redis?.status && redis.status !== "end") {
    await redis.quit().catch(() => redis.disconnect());
  }
  steps.push({ step: "close_redis", ok: true });
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  steps.push({ step: "close_database", ok: true });
  return { ok: steps.every((step) => step.ok !== false), steps };
}

function resetForTests() {
  acceptingRequests = true;
  activeRequests = 0;
}

function status() {
  return { acceptingRequests, activeRequests };
}

module.exports = { drain, resetForTests, status, trackRequest, waitForActiveRequests };
