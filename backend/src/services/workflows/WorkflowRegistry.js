const VALID_TYPES = new Set(["immediate", "scheduled", "conditional"]);

function noopHandler(label) {
  return async (context) => ({
    success: true,
    skipped: true,
    reason: `${label} workflow registered for future orchestration.`,
    eventName: context.eventName,
  });
}

function webhookDispatchHandler() {
  return async (context) => {
    const WebhookManager = require("../webhooks/WebhookManager");
    return WebhookManager.dispatcher.dispatch(context.eventName, context.payload, {
      actor: context.actor,
      requestId: context.requestId,
      ip: context.ip,
      immediate: false,
    });
  };
}

class WorkflowRegistry {
  constructor() {
    this.workflows = new Map();
    this.recurring = [];
  }

  register(definition) {
    if (!definition?.name) throw new Error("Workflow name is required.");
    if (!definition?.eventName) throw new Error("Workflow eventName is required.");
    const type = definition.type || "immediate";
    if (!VALID_TYPES.has(type)) throw new Error(`Invalid workflow type: ${type}`);

    this.workflows.set(definition.name, {
      enabled: true,
      maxAttempts: 3,
      retryDelayMs: 60_000,
      condition: null,
      handler: noopHandler(definition.name),
      ...definition,
      type,
    });
    return this;
  }

  registerRecurring(definition) {
    if (!definition?.name || !definition?.eventName || !definition?.frequency) {
      throw new Error("Recurring workflow requires name, eventName, and frequency.");
    }
    this.recurring.push({ enabled: true, ...definition });
    return this;
  }

  get(name) {
    return this.workflows.get(name) || null;
  }

  forEvent(eventName) {
    return Array.from(this.workflows.values()).filter((workflow) => workflow.eventName === eventName && workflow.enabled);
  }

  list() {
    return Array.from(this.workflows.values()).map(({ handler, condition, ...workflow }) => ({
      ...workflow,
      hasCondition: Boolean(condition),
      hasHandler: Boolean(handler),
    }));
  }

  listRecurring() {
    return [...this.recurring];
  }

  resetForTests() {
    this.workflows.clear();
    this.recurring = [];
    registerDefaultWorkflows(this);
    return this;
  }
}

function registerDefaultWorkflows(registry) {
  [
    ["notify.user.registered", "UserRegistered"],
    ["notify.email.verified", "EmailVerified"],
    ["notify.order.created", "OrderCreated"],
    ["notify.order.completed", "OrderCompleted"],
    ["notify.payment.succeeded", "PaymentSucceeded"],
    ["notify.payment.failed", "PaymentFailed"],
    ["audit.license.created", "LicenseCreated"],
    ["audit.license.activated", "LicenseActivated"],
    ["audit.license.expiring", "LicenseExpiring"],
    ["audit.license.expired", "LicenseExpired"],
    ["audit.license.renewed", "LicenseRenewed"],
    ["audit.download.completed", "DownloadCompleted"],
    ["audit.support.ticket.created", "SupportTicketCreated"],
    ["audit.version.released", "VersionReleased"],
  ].forEach(([name, eventName]) => registry.register({ name, eventName, handler: noopHandler(name) }));

  [
    "UserRegistered",
    "UserUpdated",
    "UserDeleted",
    "OrderCreated",
    "OrderCompleted",
    "PaymentSucceeded",
    "PaymentFailed",
    "PaymentRefunded",
    "LicenseCreated",
    "LicenseActivated",
    "LicenseDeactivated",
    "LicenseRenewed",
    "LicenseExpired",
    "VersionReleased",
    "DownloadCompleted",
    "SupportTicketCreated",
    "SupportTicketUpdated",
  ].forEach((eventName) => registry.register({
    name: `webhook.dispatch.${eventName}`,
    eventName,
    handler: webhookDispatchHandler(),
  }));

  registry
    .registerRecurring({ name: "daily.license.expiring", eventName: "LicenseExpiring", frequency: "daily" })
    .registerRecurring({ name: "hourly.workflow.retry", eventName: "WorkflowRetryDue", frequency: "hourly" })
    .registerRecurring({ name: "weekly.analytics.snapshot", eventName: "AnalyticsSnapshotDue", frequency: "weekly" })
    .registerRecurring({ name: "monthly.subscription.review", eventName: "SubscriptionReviewDue", frequency: "monthly" });
}

const registry = new WorkflowRegistry();
registerDefaultWorkflows(registry);

module.exports = registry;
module.exports.WorkflowRegistry = WorkflowRegistry;
module.exports.registerDefaultWorkflows = registerDefaultWorkflows;
