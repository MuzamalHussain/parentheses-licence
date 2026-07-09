const asyncHandler = require("express-async-handler");
const AIManager = require("../services/ai/AIManager");
const ModelRegistry = require("../services/ai/AIModelRegistry");
const PromptRegistry = require("../services/ai/PromptRegistry");
const RequestService = require("../services/ai/AIRequestService");

function context(req) {
  return {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  };
}

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

exports.overview = asyncHandler(async (req, res) => {
  const data = await AIManager.overview(orgId(req), context(req));
  res.json({ success: true, data });
});

exports.saveProvider = asyncHandler(async (req, res) => {
  const data = await AIManager.saveProvider(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "AI provider saved.", data });
});

exports.healthCheck = asyncHandler(async (req, res) => {
  const data = await AIManager.healthCheck(orgId(req), req.params.providerId, context(req));
  res.json({ success: true, message: "AI provider health checked.", data });
});

exports.registerModel = asyncHandler(async (req, res) => {
  const data = await ModelRegistry.registerModel(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "AI model saved.", data });
});

exports.savePrompt = asyncHandler(async (req, res) => {
  const data = await PromptRegistry.savePrompt(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "AI prompt saved.", data });
});

exports.trackUsage = asyncHandler(async (req, res) => {
  const data = await RequestService.simulateRequest({ ...req.body, organizationId: orgId(req) }, context(req));
  res.status(201).json({ success: true, message: "AI usage tracked.", data });
});
