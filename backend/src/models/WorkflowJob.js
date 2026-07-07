const mongoose = require("mongoose");

const workflowJobSchema = new mongoose.Schema(
  {
    eventName: { type: String, required: true, index: true },
    workflowName: { type: String, required: true, index: true },
    workflowType: {
      type: String,
      enum: ["immediate", "scheduled", "conditional"],
      default: "immediate",
      index: true,
    },
    idempotencyKey: { type: String, default: "" },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "retrying", "cancelled"],
      default: "queued",
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
    error: { type: String, default: "" },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    retryDelayMs: { type: Number, default: 60_000, min: 0 },
    nextRunAt: { type: Date, default: () => new Date(), index: true },
    scheduledFor: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    priority: { type: Number, default: 0, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

workflowJobSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } }
);
workflowJobSchema.index({ status: 1, nextRunAt: 1, priority: -1 });
workflowJobSchema.index({ eventName: 1, createdAt: -1 });
workflowJobSchema.index({ workflowName: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("WorkflowJob", workflowJobSchema);
