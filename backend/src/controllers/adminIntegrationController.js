const asyncHandler = require("express-async-handler");
const IntegrationManager = require("../services/integrations/IntegrationManager");
const notificationService = require("../services/notificationService");

exports.getIntegrations = asyncHandler(async (req, res) => {
  const [integrations, health] = await Promise.all([
    IntegrationManager.installedIntegrations(),
    IntegrationManager.health.getAllHealth(),
  ]);
  const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
  const visibleIntegrations = integrations.map((integration) => integration.id === "stripe" ? {
    ...integration,
    configuration: { ...integration.configuration, webhookUrl: `${publicBaseUrl}/api/v1/webhooks/stripe` },
    webhookReadiness: { routeRegistered: true, rawBodyPreserved: true, secretConfigured: Boolean(integration.secretConfigured?.webhookSecret), lastConfirmedAt: integration.lastTestCheckoutAt || null, ready: Boolean(integration.secretConfigured?.webhookSecret && integration.lastTestCheckoutAt) },
  } : integration);
  res.json({
    success: true,
    data: {
      integrations: visibleIntegrations,
      health,
      providers: IntegrationManager.registry.list(),
      api: IntegrationManager.api.getDocumentationMetadata(),
      webhooks: { events: IntegrationManager.webhooks.SUPPORTED_EVENTS },
      extensions: IntegrationManager.extensions.listExtensions(),
      categories: IntegrationManager.categories,
      security: { encryption: IntegrationManager.encryptionStatus(), secretsExposed: false },
    },
    requestId: req.id,
  });
});

exports.configureIntegration = asyncHandler(async (req, res) => {
  const integration = await IntegrationManager.configure(req.params.providerId, req.body.configuration || {}, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data: integration, requestId: req.id });
});

exports.setEnabled = asyncHandler(async (req, res) => {
  const integration = await IntegrationManager.setEnabled(req.params.providerId, Boolean(req.body.enabled), {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data: integration, requestId: req.id });
});

exports.testConnection = asyncHandler(async (req, res) => {
  const result = await IntegrationManager.testConnection(req.params.providerId, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data: result, requestId: req.id });
});

exports.getApiCapabilities = asyncHandler(async (req, res) => {
  res.json({ success: true, data: IntegrationManager.api.getDocumentationMetadata(), requestId: req.id });
});

exports.sendSmtpTestEmail = asyncHandler(async (req, res) => {
  const result = await notificationService.sendTestEmail(req.body.to);
  if (!result?.success || (!result.messageId && !result.accepted)) {
    const error = new Error("SMTP test email was not accepted by the configured transport.");
    error.code = result?.errorCode || "SMTP_TEST_FAILED";
    error.statusCode = 502;
    throw error;
  }
  res.json({ success: true, data: { messageId: result.messageId, provider: result.provider }, requestId: req.id });
});
