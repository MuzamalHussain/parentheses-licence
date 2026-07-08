const asyncHandler = require("express-async-handler");
const ReleaseAutomation = require("../services/releaseAutomation/ReleaseAutomationService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  const data = await ReleaseAutomation.dashboard(req.query);
  res.json({ success: true, data });
});

exports.connectRepository = asyncHandler(async (req, res) => {
  const repository = await ReleaseAutomation.connectRepository(req.body, context(req));
  res.status(201).json({ success: true, message: "Repository connected.", data: repository });
});

exports.checkRepositoryHealth = asyncHandler(async (req, res) => {
  const repository = await ReleaseAutomation.repositoryHealth(req.params.id, context(req));
  res.json({ success: true, message: "Repository health checked.", data: repository });
});

exports.importRelease = asyncHandler(async (req, res) => {
  const pipeline = await ReleaseAutomation.importRelease(req.params.id, req.body, context(req));
  res.status(201).json({ success: true, message: "Release imported.", data: pipeline });
});

exports.validatePipeline = asyncHandler(async (req, res) => {
  const pipeline = await ReleaseAutomation.validatePipeline(req.params.id, context(req));
  res.json({ success: true, message: "Release pipeline validated.", data: pipeline });
});

exports.updatePipelineStatus = asyncHandler(async (req, res) => {
  const pipeline = await ReleaseAutomation.setPipelineStatus(req.params.id, req.body.status, context(req));
  res.json({ success: true, message: "Release pipeline updated.", data: pipeline });
});
