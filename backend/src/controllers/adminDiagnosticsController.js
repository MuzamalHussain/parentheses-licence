const asyncHandler = require("express-async-handler");
const { getSystemDiagnostics } = require("../services/diagnosticsService");

exports.getDiagnostics = asyncHandler(async (req, res) => {
  const diagnostics = await getSystemDiagnostics({
    verifySmtp: req.query.verifySmtp === "true",
  });

  res.json({
    ...diagnostics,
    requestId: req.id,
  });
});
