const asyncHandler = require("express-async-handler");
const FraudDetection = require("../services/aiFraud/AIFraudDetectionService");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await FraudDetection.dashboard({
    actor: req.user,
    organizationId: orgId(req),
    period: req.query.period,
    start: req.query.start,
    end: req.query.end,
  }, context(req));
  res.json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  const data = await FraudDetection.history({
    actor: req.user,
    organizationId: orgId(req),
    limit: req.query.limit,
  });
  res.json({ success: true, data });
});
