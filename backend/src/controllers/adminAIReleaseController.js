const asyncHandler = require("express-async-handler");
const AIRelease = require("../services/aiRelease/AIReleaseIntelligenceService");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.analyze = asyncHandler(async (req, res) => {
  const data = await AIRelease.analyze({
    actor: req.user,
    organizationId: orgId(req),
    productId: req.body.productId || req.query.productId,
    versionId: req.body.versionId || req.query.versionId,
  }, context(req));
  res.status(201).json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  const data = await AIRelease.history({
    actor: req.user,
    organizationId: orgId(req),
    productId: req.query.productId,
    limit: req.query.limit,
  });
  res.json({ success: true, data });
});
