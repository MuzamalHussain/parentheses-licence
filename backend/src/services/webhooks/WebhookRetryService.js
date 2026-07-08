const OutgoingWebhook = require("../../models/OutgoingWebhook");
const DeliveryService = require("./WebhookDeliveryService");
const { writeAuditLog } = require("../../utils/auditLog");

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function nextDelay(attempts) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

async function scheduleRetry(record, { actor = null, requestId = "", ip = "" } = {}) {
  const attempts = record.attempts || 0;
  const maxAttempts = record.maxAttempts || RETRY_DELAYS_MS.length;
  if (attempts >= maxAttempts) {
    Object.assign(record, { status: "dead_letter", deadLetterAt: new Date(), nextAttemptAt: null });
    if (typeof record.save === "function") await record.save();
    else await OutgoingWebhook.updateOne({ _id: record._id }, { $set: { status: "dead_letter", deadLetterAt: record.deadLetterAt, nextAttemptAt: null } });
    await writeAuditLog({ actor, action: "webhook.dead_lettered", targetType: "OutgoingWebhook", targetId: record._id, metadata: { eventId: record.eventId, attempts }, ip, requestId });
    return { deadLetter: true };
  }

  const nextAttemptAt = new Date(Date.now() + nextDelay(attempts + 1));
  Object.assign(record, { status: "retrying", nextAttemptAt });
  if (typeof record.save === "function") await record.save();
  else await OutgoingWebhook.updateOne({ _id: record._id }, { $set: { status: "retrying", nextAttemptAt } });
  return { retrying: true, nextAttemptAt };
}

async function retryDelivery(id, options = {}) {
  const record = await OutgoingWebhook.findById(id);
  if (!record) return null;
  record.status = "queued";
  record.nextAttemptAt = new Date();
  if (typeof record.save === "function") await record.save();
  const result = await DeliveryService.deliver(record, options);
  if (!result.success) await scheduleRetry(record, options);
  await writeAuditLog({ actor: options.actor || null, action: "webhook.retry_executed", targetType: "OutgoingWebhook", targetId: record._id, metadata: { eventId: record.eventId, result }, ip: options.ip || "", requestId: options.requestId || "" });
  return result;
}

async function processRetryQueue({ limit = 25, now = new Date(), ...options } = {}) {
  const records = await OutgoingWebhook.find({ status: "retrying", nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(limit);
  const results = [];
  for (const record of records) results.push({ id: record._id, ...(await retryDelivery(record._id, options)) });
  return { success: true, processed: results.length, results };
}

module.exports = { RETRY_DELAYS_MS, nextDelay, scheduleRetry, retryDelivery, processRetryQueue };
