const WorkflowJob = require("../../models/WorkflowJob");
const { writeAuditLog } = require("../../utils/auditLog");
const WorkflowContext = require("./WorkflowContext");

function serializeError(err) {
  return err?.message || String(err || "Workflow failed.");
}

async function persist(job, patch) {
  Object.assign(job, patch);
  if (typeof job.save === "function") return job.save();
  return WorkflowJob.updateOne({ _id: job._id }, { $set: patch });
}

async function audit(action, job, context, metadata = {}) {
  await writeAuditLog({
    actor: context.actor,
    action,
    targetType: "WorkflowJob",
    targetId: job?._id,
    metadata: {
      eventName: job?.eventName,
      workflowName: job?.workflowName,
      status: job?.status,
      ...metadata,
    },
    ip: context.ip,
    requestId: context.requestId,
  });
}

class WorkflowExecutor {
  async execute(job, workflow, baseContext = {}) {
    if (!job || !workflow) throw new Error("Workflow job and definition are required.");
    if (job.status === "cancelled") return { success: false, cancelled: true };

    const context = baseContext instanceof WorkflowContext
      ? baseContext
      : new WorkflowContext({
        eventName: job.eventName,
        payload: job.payload,
        metadata: job.context,
        job,
        ...baseContext,
      });

    await persist(job, {
      status: "running",
      attempts: (job.attempts || 0) + 1,
      startedAt: new Date(),
      lockedAt: new Date(),
      error: "",
    });
    await audit("workflow.started", job, context);

    try {
      if (workflow.condition && !(await workflow.condition(context))) {
        const result = { success: true, skipped: true, reason: "condition_not_met" };
        await persist(job, { status: "completed", completedAt: new Date(), lockedAt: null, result });
        await audit("workflow.completed", job, context, { result });
        return result;
      }

      const result = await workflow.handler(context);
      await persist(job, { status: "completed", completedAt: new Date(), lockedAt: null, result: result || {} });
      await audit("workflow.completed", job, context, { result: result || {} });
      return { success: true, result: result || {} };
    } catch (err) {
      const attempts = job.attempts || 1;
      const maxAttempts = job.maxAttempts || workflow.maxAttempts || 3;
      const retrying = attempts < maxAttempts;
      const nextRunAt = retrying
        ? new Date(Date.now() + (job.retryDelayMs || workflow.retryDelayMs || 60_000) * attempts)
        : job.nextRunAt;
      const patch = {
        status: retrying ? "retrying" : "failed",
        failedAt: new Date(),
        lockedAt: null,
        error: serializeError(err),
        nextRunAt,
      };
      await persist(job, patch);
      await audit(retrying ? "workflow.retry_executed" : "workflow.failed", job, context, {
        error: patch.error,
        attempts,
        maxAttempts,
        nextRunAt,
      });
      return { success: false, retrying, error: patch.error };
    }
  }
}

module.exports = new WorkflowExecutor();
module.exports.WorkflowExecutor = WorkflowExecutor;
