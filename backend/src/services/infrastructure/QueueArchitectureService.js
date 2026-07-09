const WorkflowEngine = require("../workflows/WorkflowEngine");
const mongoose = require("mongoose");

const workers = [
  { id: "emails", queue: "notifications.email", concurrency: 5, isolated: true },
  { id: "notifications", queue: "notifications.in_app", concurrency: 10, isolated: true },
  { id: "ai", queue: "ai.tasks", concurrency: 2, isolated: true },
  { id: "webhooks", queue: "integrations.webhooks", concurrency: 5, isolated: true },
  { id: "imports", queue: "release.imports", concurrency: 2, isolated: true },
  { id: "exports", queue: "compliance.exports", concurrency: 2, isolated: true },
  { id: "reports", queue: "analytics.reports", concurrency: 2, isolated: true },
];

function withTimeout(promise, timeoutMs = 250) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ pending: 0, running: 0, failed: 0, retryQueue: 0, timedOut: true }), timeoutMs)),
  ]);
}

async function status() {
  const stats = mongoose.connection.readyState === 1
    ? await withTimeout(WorkflowEngine.stats()).catch(() => ({ pending: 0, running: 0, failed: 0, retryQueue: 0 }))
    : { pending: 0, running: 0, failed: 0, retryQueue: 0, databaseDisconnected: true };
  return {
    workers,
    stats,
    queueIsolation: true,
    futureExternalQueues: ["bullmq", "sqs", "rabbitmq", "kafka", "cloud_tasks"],
  };
}

module.exports = { status, workers };
