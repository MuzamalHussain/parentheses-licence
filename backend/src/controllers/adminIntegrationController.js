const asyncHandler = require("express-async-handler");
const IntegrationManager = require("../services/integrations/IntegrationManager");

exports.getIntegrations = asyncHandler(async (req, res) => {
  const [integrations, health] = await Promise.all([
    IntegrationManager.installedIntegrations(),
    IntegrationManager.health.getAllHealth(),
  ]);
  res.json({
    success: true,
    data: {
      integrations,
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
