const asyncHandler = require("express-async-handler");
const OperationsService = require("../services/operations/OperationsService");

exports.getDashboard = asyncHandler(async (req, res) => {
  const data = await OperationsService.getDashboard({ force: req.query.force === "true" });
  res.json({ success: true, data, requestId: req.id });
});

exports.runMaintenanceAction = asyncHandler(async (req, res) => {
  const data = await OperationsService.runMaintenanceAction({
    action: req.params.action,
    body: req.body || {},
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data, requestId: req.id });
});
