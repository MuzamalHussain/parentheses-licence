const WebhookEndpoint = require("../../models/WebhookEndpoint");
const OutgoingWebhook = require("../../models/OutgoingWebhook");
const Registry = require("./WebhookRegistry");
const Dispatcher = require("./WebhookDispatcher");
const RetryService = require("./WebhookRetryService");
const SignatureService = require("./WebhookSignatureService");
const { validateDestinationUrl } = require("./WebhookSecurity");
const { writeAuditLog } = require("../../utils/auditLog");

async function audit({ actor, action, targetId = null, metadata = {}, ip = "", requestId = "" }) {
  await writeAuditLog({ actor, action, targetType: "WebhookEndpoint", targetId, metadata, ip, requestId });
}

async function createEndpoint({ name, targetUrl, secret = "", subscribedEvents = [], enabled = true, actor = null, ip = "", requestId = "" }) {
  const urlCheck = validateDestinationUrl(targetUrl);
  if (!urlCheck.valid) {
    const err = new Error(`Invalid webhook target URL: ${urlCheck.reason}`);
    err.statusCode = 422;
    throw err;
  }
  const rawSecret = secret || SignatureService.generateSecret();
  const endpoint = await WebhookEndpoint.create({
    name,
    targetUrl,
    secretHash: SignatureService.hashSecret(rawSecret),
    secretLast4: rawSecret.slice(-4),
    enabled,
    subscribedEvents: subscribedEvents.filter((eventName) => Registry.supports(eventName)),
    createdBy: actor?._id || null,
  });
  await audit({ actor, action: "webhook.created", targetId: endpoint._id, metadata: { subscribedEvents: endpoint.subscribedEvents }, ip, requestId });
  return { endpoint, secret: rawSecret };
}

async function updateEndpoint(id, patch, { actor = null, ip = "", requestId = "" } = {}) {
  if (patch.targetUrl) {
    const urlCheck = validateDestinationUrl(patch.targetUrl);
    if (!urlCheck.valid) {
      const err = new Error(`Invalid webhook target URL: ${urlCheck.reason}`);
      err.statusCode = 422;
      throw err;
    }
  }
  const update = { ...patch };
  if (patch.secret) {
    update.secretHash = SignatureService.hashSecret(patch.secret);
    update.secretLast4 = patch.secret.slice(-4);
    delete update.secret;
  }
  if (Array.isArray(update.subscribedEvents)) update.subscribedEvents = update.subscribedEvents.filter((eventName) => Registry.supports(eventName));
  const endpoint = await WebhookEndpoint.findByIdAndUpdate(id, update, { new: true });
  await audit({ actor, action: "webhook.updated", targetId: id, metadata: { fields: Object.keys(patch) }, ip, requestId });
  return endpoint;
}

async function deleteEndpoint(id, { actor = null, ip = "", requestId = "" } = {}) {
  const endpoint = await WebhookEndpoint.findByIdAndUpdate(id, { enabled: false }, { new: true });
  await audit({ actor, action: "webhook.deleted", targetId: id, ip, requestId });
  return endpoint;
}

async function listEndpoints() {
  return WebhookEndpoint.find().sort({ createdAt: -1 }).lean();
}

async function listDeliveries(filter = {}) {
  const query = {};
  if (filter.eventName) query.eventName = filter.eventName;
  if (filter.status) query.status = filter.status;
  if (filter.endpointUrl) query.endpointUrl = { $regex: filter.endpointUrl, $options: "i" };
  if (filter.dateFrom || filter.dateTo) {
    query.createdAt = {};
    if (filter.dateFrom) query.createdAt.$gte = new Date(filter.dateFrom);
    if (filter.dateTo) query.createdAt.$lte = new Date(filter.dateTo);
  }
  const page = Math.max(Number(filter.page || 1), 1);
  const limit = Math.min(Math.max(Number(filter.limit || 25), 1), 100);
  const [items, total] = await Promise.all([
    OutgoingWebhook.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OutgoingWebhook.countDocuments(query),
  ]);
  return { items, total, page, limit };
}

async function stats() {
  const rows = await OutgoingWebhook.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  const counts = { queued: 0, delivering: 0, sent: 0, failed: 0, retrying: 0, dead_letter: 0, disabled: 0, skipped: 0 };
  rows.forEach((row) => {
    if (row._id in counts) counts[row._id] = row.count;
  });
  return { ...counts, failedDeliveries: counts.failed + counts.dead_letter, retryQueue: counts.retrying };
}

module.exports = {
  registry: Registry,
  dispatcher: Dispatcher,
  retry: RetryService,
  delivery: require("./WebhookDeliveryService"),
  signatures: SignatureService,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  listEndpoints,
  listDeliveries,
  stats,
};
