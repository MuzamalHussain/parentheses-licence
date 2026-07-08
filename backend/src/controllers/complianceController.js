const asyncHandler = require("express-async-handler");
const ComplianceService = require("../services/compliance/ComplianceService");

function context(req) {
  return {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
    userAgent: req.headers?.["user-agent"] || "",
  };
}

exports.recordConsent = asyncHandler(async (req, res) => {
  const data = await ComplianceService.recordConsent(req.user._id, req.body.organizationId || req.user.activeOrganizationId || null, req.body, context(req));
  res.status(201).json({ success: true, message: "Consent preference recorded.", data });
});

exports.consentHistory = asyncHandler(async (req, res) => {
  const data = await ComplianceService.consentHistory(req.user._id, req.query.organizationId || req.user.activeOrganizationId || null, context(req));
  res.json({ success: true, data });
});
