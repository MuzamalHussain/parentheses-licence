const asyncHandler = require("express-async-handler");
const AIBusinessInsightService = require("../services/aiBusiness/AIBusinessInsightService");

function requestContext(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

function organizationId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await AIBusinessInsightService.dashboard({
    actor: req.user,
    organizationId: organizationId(req),
    period: req.query.period,
    start: req.query.start,
    end: req.query.end,
  }, requestContext(req));
  res.json({ success: true, data });
});

exports.query = asyncHandler(async (req, res) => {
  const data = await AIBusinessInsightService.query({
    actor: req.user,
    organizationId: organizationId(req),
    question: req.body.question,
    period: req.body.period || req.query.period,
    start: req.body.start || req.query.start,
    end: req.body.end || req.query.end,
  }, requestContext(req));
  res.status(201).json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  const data = await AIBusinessInsightService.history({
    actor: req.user,
    organizationId: organizationId(req),
    limit: req.query.limit,
  });
  res.json({ success: true, data });
});
