const axios = require("axios");
const OutgoingWebhook = require("../../models/OutgoingWebhook");
const WebhookEndpoint = require("../../models/WebhookEndpoint");
const { writeAuditLog } = require("../../utils/auditLog");

function truncate(value = "", max = 2000) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function persist(record, patch) {
  Object.assign(record, patch);
  if (typeof record.save === "function") return record.save();
  return OutgoingWebhook.updateOne({ _id: record._id }, { $set: patch });
}

async function deliver(record, { httpClient = axios, actor = null, requestId = "", ip = "" } = {}) {
  if (!record || !record.endpointUrl) throw new Error("Webhook delivery record is required.");
  if (record.status === "dead_letter" || record.status === "disabled") return { success: false, skipped: true };

  const startedAt = Date.now();
  await persist(record, { status: "delivering", attempts: (record.attempts || 0) + 1 });

  try {
    const response = await httpClient.post(record.endpointUrl, record.envelope || record.payload, {
      timeout: 10_000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Parentheses-Licence-Webhooks/1.0",
        "X-Parentheses-Event": record.eventName,
        "X-Parentheses-Event-Id": record.eventId,
        "X-Parentheses-Signature": record.signature,
        "X-Parentheses-Timestamp": record.timestampHeader,
      },
      validateStatus: () => true,
    });
    const durationMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 300;
    const patch = {
      status: ok ? "sent" : "failed",
      responseStatus: response.status,
      responseBody: truncate(response.data),
      durationMs,
      sentAt: ok ? new Date() : record.sentAt,
      lastError: ok ? "" : `HTTP_${response.status}`,
    };
    await persist(record, patch);
    if (record.endpointId) {
      await WebhookEndpoint.findByIdAndUpdate(record.endpointId, {
        lastDeliveryAt: new Date(),
        ...(ok ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }),
      });
    }
    await writeAuditLog({
      actor,
      action: ok ? "webhook.delivery_success" : "webhook.delivery_failure",
      targetType: "OutgoingWebhook",
      targetId: record._id,
      metadata: { eventId: record.eventId, eventName: record.eventName, statusCode: response.status, durationMs },
      ip,
      requestId,
    });
    return { success: ok, statusCode: response.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await persist(record, {
      status: "failed",
      durationMs,
      lastError: err.message,
    });
    if (record.endpointId) {
      await WebhookEndpoint.findByIdAndUpdate(record.endpointId, { lastDeliveryAt: new Date(), lastFailureAt: new Date() });
    }
    await writeAuditLog({
      actor,
      action: "webhook.delivery_failure",
      targetType: "OutgoingWebhook",
      targetId: record._id,
      metadata: { eventId: record.eventId, eventName: record.eventName, error: err.message, durationMs },
      ip,
      requestId,
    });
    return { success: false, error: err.message, durationMs };
  }
}

module.exports = { deliver };
