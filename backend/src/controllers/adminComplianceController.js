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

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await ComplianceService.dashboard(orgId(req), context(req));
  res.json({ success: true, data });
});

exports.updatePolicy = asyncHandler(async (req, res) => {
  const data = await ComplianceService.updatePolicy(orgId(req), req.body, context(req));
  res.json({ success: true, message: "Compliance policy updated.", data });
});

exports.requestExport = asyncHandler(async (req, res) => {
  const data = await ComplianceService.requestExport(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "Compliance export completed.", data });
});

exports.createLegalHold = asyncHandler(async (req, res) => {
  const data = await ComplianceService.createLegalHold(orgId(req), req.body, context(req));
  res.status(201).json({ success: true, message: "Legal hold enabled.", data });
});

exports.releaseLegalHold = asyncHandler(async (req, res) => {
  const data = await ComplianceService.releaseLegalHold(orgId(req), req.params.holdId, context(req));
  res.json({ success: true, message: "Legal hold released.", data });
});

exports.anonymizeUser = asyncHandler(async (req, res) => {
  const data = await ComplianceService.anonymizeUser(req.params.userId, orgId(req), context(req));
  res.json({ success: true, message: "Personal data anonymized.", data });
});

exports.report = asyncHandler(async (req, res) => {
  const data = await ComplianceService.generateReport(orgId(req), req.params.type, context(req));
  res.json({ success: true, data });
});
