const crypto = require("crypto");
const WorkflowJob = require("../../models/WorkflowJob");
const registry = require("./WorkflowRegistry");
const executor = require("./WorkflowExecutor");
const WorkflowContext = require("./WorkflowContext");
const WorkflowScheduler = require("./WorkflowScheduler");

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {})).digest("hex").slice(0, 24);
}

function defaultIdempotencyKey(eventName, workflowName, payload) {
  const businessId = payload?.id || payload?._id || payload?.orderId || payload?.paymentId || payload?.licenseId || payload?.downloadId;
  return `${eventName}:${workflowName}:${businessId || stableHash(payload)}`;
}

async function createJob(definition, eventName, payload, options = {}) {
  const idempotencyKey = options.idempotencyKey || defaultIdempotencyKey(eventName, definition.name, payload);
  const now = new Date();
  const nextRunAt = options.runAt ? new Date(options.runAt) : now;
  try {
    return await WorkflowJob.create({
      eventName,
      workflowName: definition.name,
      workflowType: options.type || definition.type,
      idempotencyKey,
      status: "queued",
      payload,
      context: {
        ...(options.metadata || {}),
        emittedAt: now,
      },
      maxAttempts: options.maxAttempts || definition.maxAttempts || 3,
      retryDelayMs: options.retryDelayMs ?? definition.retryDelayMs ?? 60_000,
      nextRunAt,
      scheduledFor: options.runAt ? nextRunAt : null,
      priority: options.priority || 0,
      createdBy: options.actor?._id || null,
    });
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true, idempotencyKey };
    throw err;
  }
}

class WorkflowEngine {
  constructor() {
    this.registry = registry;
    this.executor = executor;
    this.scheduler = new WorkflowScheduler(registry);
  }

  async dispatch(eventName, payload = {}, options = {}) {
    const workflows = this.registry.forEvent(eventName);
    const context = new WorkflowContext({
      eventName,
      payload,
      metadata: options.metadata,
      actor: options.actor,
      requestId: options.requestId,
      ip: options.ip,
    });
    const results = [];

    for (const workflow of workflows) {
      const runAt = options.runAt || workflow.runAt;
      const type = runAt ? "scheduled" : workflow.type;
      const job = await createJob(workflow, eventName, payload, { ...options, type, runAt });
      if (job.duplicate) {
        results.push({ workflowName: workflow.name, duplicate: true, idempotencyKey: job.idempotencyKey });
        continue;
      }

      if (type === "immediate" || type === "conditional") {
        results.push({ workflowName: workflow.name, jobId: job._id, ...(await this.executor.execute(job, workflow, { ...context, job })) });
      } else {
        results.push({ workflowName: workflow.name, jobId: job._id, scheduled: true, nextRunAt: job.nextRunAt });
      }
    }

    return { success: true, eventName, matched: workflows.length, results };
  }

  async schedule(eventName, payload = {}, runAt, options = {}) {
    return this.dispatch(eventName, payload, { ...options, runAt });
  }

  async processDueJobs({ limit = 50, now = new Date() } = {}) {
    const jobs = await WorkflowJob.find({
      status: { $in: ["queued", "retrying"] },
      nextRunAt: { $lte: now },
    })
      .sort({ priority: -1, nextRunAt: 1, createdAt: 1 })
      .limit(limit);

    const results = [];
    for (const job of jobs) {
      const workflow = this.registry.get(job.workflowName);
      if (!workflow || !workflow.enabled) continue;
      results.push({ jobId: job._id, workflowName: job.workflowName, ...(await this.executor.execute(job, workflow)) });
    }
    return { success: true, processed: results.length, results };
  }

  async retryJob(jobId, actor = null) {
    const job = await WorkflowJob.findById(jobId);
    if (!job) return null;
    if (!["failed", "retrying"].includes(job.status)) throw new Error("Only failed or retrying workflow jobs can be retried.");
    job.status = "queued";
    job.nextRunAt = new Date();
    job.error = "";
    await job.save();
    const workflow = this.registry.get(job.workflowName);
    return this.executor.execute(job, workflow, { actor });
  }

  async cancelJob(jobId) {
    return WorkflowJob.findOneAndUpdate(
      { _id: jobId, status: { $in: ["queued", "retrying", "running"] } },
      { $set: { status: "cancelled", cancelledAt: new Date(), lockedAt: null } },
      { new: true }
    );
  }

  async stats() {
    const rows = await WorkflowJob.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
    const counts = { queued: 0, running: 0, completed: 0, failed: 0, retrying: 0, cancelled: 0 };
    rows.forEach((row) => {
      if (row._id in counts) counts[row._id] = row.count;
    });
    return {
      ...counts,
      pending: counts.queued,
      retryQueue: counts.retrying,
      registeredWorkflows: this.registry.list().length,
      recurringJobs: this.scheduler.listRecurring().length,
    };
  }
}

module.exports = new WorkflowEngine();
module.exports.WorkflowEngine = WorkflowEngine;
module.exports.defaultIdempotencyKey = defaultIdempotencyKey;
