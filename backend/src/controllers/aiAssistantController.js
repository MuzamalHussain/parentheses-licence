const asyncHandler = require("express-async-handler");
const ConversationService = require("../services/aiAssistant/AIConversationService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.ask = asyncHandler(async (req, res) => {
  const data = await ConversationService.ask({
    actor: req.user,
    organizationId: req.body.organizationId || req.user.activeOrganizationId || null,
    audience: "customer",
    question: req.body.question,
    conversationId: req.body.conversationId || null,
    providerId: req.body.providerId || "",
    modelId: req.body.modelId || "",
  }, context(req));
  res.status(201).json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  const data = await ConversationService.list({ actor: req.user, organizationId: req.query.organizationId || req.user.activeOrganizationId || null, audience: "customer" });
  res.json({ success: true, data });
});
