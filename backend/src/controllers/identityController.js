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

exports.startMfa = asyncHandler(async (req, res) => {
  const data = await Identity.startMfaSetup(req.user._id, req.body.organizationId || req.user.activeOrganizationId || null, context(req));
  res.status(201).json({ success: true, message: "MFA setup started.", data });
});

exports.verifyMfa = asyncHandler(async (req, res) => {
  const data = await Identity.verifyMfaSetup(req.user._id, req.body.code, req.body.organizationId || req.user.activeOrganizationId || null, context(req));
  res.json({ success: true, message: "MFA enabled.", data });
});

exports.disableMfa = asyncHandler(async (req, res) => {
  const data = await Identity.disableMfa(req.user._id, req.body.organizationId || req.user.activeOrganizationId || null, context(req));
  res.json({ success: true, message: "MFA disabled.", data });
});
