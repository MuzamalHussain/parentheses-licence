const crypto = require("crypto");
const OutgoingWebhook = require("../../models/OutgoingWebhook");
const WebhookEndpoint = require("../../models/WebhookEndpoint");
const SignatureService = require("./WebhookSignatureService");
const DeliveryService = require("./WebhookDeliveryService");
const RetryService = require("./WebhookRetryService");
const { validateDestinationUrl } = require("./WebhookSecurity");
const { writeAuditLog } = require("../../utils/auditLog");

function makeEnvelope(eventName, payload = {}, options = {}) {
  return {
    id: options.eventId || `evt_${crypto.randomBytes(16).toString("hex")}`,
    event: eventName,
    timestamp: new Date().toISOString(),
    api_version: options.apiVersion || "2026-07-08",
    payload,
  };
}

async function queueForEndpoint(endpoint, eventName, payload = {}, options = {}) {
  const urlCheck = validateDestinationUrl(endpoint.targetUrl);
  const envelope = makeEnvelope(eventName, payload, { apiVersion: endpoint.apiVersion, eventId: options.eventId });
  const secret = options.secret || endpoint.secret || "";
  const signature = SignatureService.signEnvelope(secret, envelope);
  const record = await OutgoingWebhook.create({
    eventId: envelope.id,
    endpointId: endpoint._id,
    providerId: options.providerId || "webhook",
    eventName,
    endpointUrl: endpoint.targetUrl || "not-configured",
    status: endpoint.enabled && urlCheck.valid ? "queued" : (endpoint.enabled ? "skipped" : "disabled"),
    attempts: 0,
    maxAttempts: endpoint.maxRetries,
    payload,
    envelope,
    signature: signature.signature,
    timestampHeader: signature.timestamp,
    lastError: urlCheck.valid ? "" : urlCheck.reason,
  });
  return record;
}

async function dispatch(eventName, payload = {}, options = {}) {
  const endpoints = await WebhookEndpoint.find({ enabled: true, subscribedEvents: eventName });
  const results = [];
  for (const endpoint of endpoints) {
    const record = await queueForEndpoint(endpoint, eventName, payload, options);
    await writeAuditLog({
      actor: options.actor || null,
      action: "webhook.queued",
      targetType: "OutgoingWebhook",
      targetId: record._id,
      metadata: { endpointId: endpoint._id, eventId: record.eventId, eventName },
      ip: options.ip || "",
      requestId: options.requestId || "",
    });
    if (options.immediate && record.status === "queued") {
      const delivery = await DeliveryService.deliver(record, options);
      if (!delivery.success) await RetryService.scheduleRetry(record, options);
      results.push({ endpointId: endpoint._id, deliveryId: record._id, status: record.status, delivery });
    } else {
      results.push({ endpointId: endpoint._id, deliveryId: record._id, status: record.status });
    }
  }
  return { success: true, eventName, dispatched: results.length, results };
}

module.exports = { makeEnvelope, queueForEndpoint, dispatch };
