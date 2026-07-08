const asyncHandler = require("express-async-handler");
const Identity = require("../services/identity/EnterpriseIdentityService");

function context(req) {
  return {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
    userAgent: req.headers?.["user-agent"] || "",
  };
}

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

exports.overview = asyncHandler(async (req, res) => {
  const data = await Identity.overview(orgId(req), context(req));
  res.json({ success: true, data });
});

exports.updatePolicy = asyncHandler(async (req, res) => {
  const data = await Identity.updatePolicy(orgId(req), req.body, context(req));
  res.json({ success: true, message: "Security policy updated.", data });
});

exports.saveProvider = asyncHandler(async (req, res) => {
  const data = await Identity.saveProvider(orgId(req), req.body, context(req));
  res.status(req.body.providerId ? 200 : 201).json({ success: true, message: "Identity provider saved.", data });
});

exports.setProviderStatus = asyncHandler(async (req, res) => {
  const data = await Identity.setProviderStatus(orgId(req), req.params.providerId, req.body.status, context(req));
  res.json({ success: true, message: "Identity provider updated.", data });
});

exports.testProvider = asyncHandler(async (req, res) => {
  const data = await Identity.testProvider(orgId(req), req.params.providerId, context(req));
  res.json({ success: true, message: data.healthy ? "Provider configuration is ready." : "Provider configuration needs attention.", data });
});

exports.revokeSession = asyncHandler(async (req, res) => {
  const data = await Identity.revokeSession(req.params.userId, req.params.sessionId, orgId(req), context(req));
  res.json({ success: true, message: "Session revoked.", data });
});
