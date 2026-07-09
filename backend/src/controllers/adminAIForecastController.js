const asyncHandler = require("express-async-handler");
const Forecasting = require("../services/aiForecast/AIForecastingService");

function orgId(req) {
  return req.params.organizationId || req.body.organizationId || req.query.organizationId || req.user.activeOrganizationId;
}

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.generate = asyncHandler(async (req, res) => {
  const data = await Forecasting.generate({
    actor: req.user,
    organizationId: orgId(req),
    historicalWindowDays: req.body.historicalWindowDays || req.query.historicalWindowDays,
    forecastWindowDays: req.body.forecastWindowDays || req.query.forecastWindowDays,
  }, context(req));
  res.status(201).json({ success: true, data });
});

exports.history = asyncHandler(async (req, res) => {
  const data = await Forecasting.history({
    actor: req.user,
    organizationId: orgId(req),
    limit: req.query.limit,
  });
  res.json({ success: true, data });
});
