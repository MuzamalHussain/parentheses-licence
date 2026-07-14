const Integration = require("../../models/Integration");
const OutgoingWebhook = require("../../models/OutgoingWebhook");
const { writeAuditLog } = require("../../utils/auditLog");
const WebhookDispatcher = require("../webhooks/WebhookDispatcher");
const WebhookSignatureService = require("../webhooks/WebhookSignatureService");
const { validateDestinationUrl } = require("../webhooks/WebhookSecurity");
const SecretService = require("../security/IntegrationSecretService");

const SUPPORTED_EVENTS = [
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
];

function signPayload(secret, payload) {
  return WebhookSignatureService.signEnvelope(secret, payload).digest;
}

function validateWebhookConfig(config = {}) {
  if (!config.webhookUrl) return { valid: false, reason: "webhookUrl_not_configured" };
  return validateDestinationUrl(config.webhookUrl);
}

async function dispatch(eventName, payload = {}, options = {}) {
  if (!SUPPORTED_EVENTS.includes(eventName)) return { success: true, dispatched: 0, skipped: true, reason: "unsupported_event" };
  const query = Integration.find({
    enabled: true,
    status: { $in: ["connected", "pending"] },
    "configuration.webhookEvents": eventName,
  });
  const selected = typeof query.select === "function" ? query.select("+encryptedSecrets") : query;
  const integrations = typeof selected.lean === "function" ? await selected.lean() : await selected;

  const results = [];
  for (const integration of integrations) {
    const validation = validateWebhookConfig(integration.configuration);
    const envelope = WebhookDispatcher.makeEnvelope(eventName, payload, { apiVersion: "2026-07-08" });
    const signingSecret = integration.encryptedSecrets?.signingSecret
      ? SecretService.decrypt(integration.encryptedSecrets.signingSecret)
      : integration.configuration?.signingSecret || "";
    const signature = WebhookSignatureService.signEnvelope(signingSecret, envelope);
    const record = await OutgoingWebhook.create({
      eventId: envelope.id,
      endpointId: null,
      integrationId: integration._id,
      providerId: integration.providerId,
      eventName,
      endpointUrl: integration.configuration?.webhookUrl || "not-configured",
      status: validation.valid ? "pending" : "skipped",
      attempts: 0,
      maxAttempts: 4,
      payload,
      envelope,
      signature: signature.signature,
      timestampHeader: signature.timestamp,
      lastError: validation.valid ? "" : validation.reason,
    });
    if (typeof record.save === "function") await record.save();
    await writeAuditLog({
      actor: options.actor || null,
      action: validation.valid ? "integration.webhook_queued" : "integration.webhook_skipped",
      targetType: "OutgoingWebhook",
      targetId: record._id,
      metadata: { providerId: integration.providerId, eventName, reason: validation.reason || "" },
      ip: options.ip || "",
      requestId: options.requestId || "",
    });
    results.push({ providerId: integration.providerId, webhookId: record._id, status: record.status });
  }
  return { success: true, eventName, dispatched: results.length, results };
}

module.exports = { SUPPORTED_EVENTS, signPayload, validateWebhookConfig, dispatch };
