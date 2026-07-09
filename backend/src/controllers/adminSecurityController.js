const asyncHandler = require("express-async-handler");
const ZeroTrust = require("../services/security/ZeroTrustManager");
const Policy = require("../services/security/PolicyEngine");
const Runtime = require("../services/security/RuntimeProtectionService");
const Decisions = require("../services/security/SecurityDecisionEngine");
const Sessions = require("../services/security/SessionSecurityService");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ZeroTrust.dashboard(), requestId: req.id });
});

exports.policies = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Policy.listPolicies(), requestId: req.id });
});

exports.updatePolicy = asyncHandler(async (req, res) => {
  const data = await ZeroTrust.updatePolicy(req.params.scope, req.body || {}, {
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data, requestId: req.id });
});

exports.runtime = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Runtime.snapshot(), requestId: req.id });
});

exports.secretHealth = asyncHandler(async (req, res) => {
  res.json({ success: true, data: ZeroTrust.secretHealth(), requestId: req.id });
});

exports.dependencyHealth = asyncHandler(async (req, res) => {
  res.json({ success: true, data: ZeroTrust.dependencyHealth(), requestId: req.id });
});

exports.evaluate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Decisions.decideIdentity(req.body || {}), requestId: req.id });
});

exports.revokeSession = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Sessions.revoke(req.params.sessionId), requestId: req.id });
});
