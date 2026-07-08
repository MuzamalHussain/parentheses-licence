const asyncHandler = require("express-async-handler");
const DeveloperPortal = require("../services/developerPortal/DeveloperPortalService");

exports.dashboard = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: DeveloperPortal.dashboard() });
});

exports.openapi = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: DeveloperPortal.dashboard().openapi });
});

exports.postmanCollection = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: DeveloperPortal.postmanCollection() });
});

exports.postmanEnvironment = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: DeveloperPortal.postmanEnvironment() });
});

exports.search = asyncHandler(async (req, res) => {
  res.json({ success: true, data: DeveloperPortal.search(req.query.q || "") });
});

exports.sandboxExecute = asyncHandler(async (req, res) => {
  const data = await DeveloperPortal.sandboxExecute(req.body);
  res.json({ success: true, data });
});
