const asyncHandler = require("express-async-handler");
const AICommandCenter = require("../services/aiCommand/AICommandCenter");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await AICommandCenter.buildDashboard({
    actor: req.user,
    organizationId: orgId(req),
    force: req.query.force === "true",
  }, context(req));
  res.json({ success: true, data });
});

exports.command = asyncHandler(async (req, res) => {
  const data = await AICommandCenter.command({
    actor: req.user,
    organizationId: orgId(req),
    question: req.body.question,
  }, context(req));
  res.status(201).json({ success: true, data });
});
