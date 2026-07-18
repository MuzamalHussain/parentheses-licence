const asyncHandler = require("express-async-handler"); const Health = require("../services/health/HealthService");
const context = (req) => ({ force: true, deep: req.body?.deep !== false, actorId: req.user._id, requestId: req.id, ip: req.ip });
exports.getDiagnostics = asyncHandler(async (req, res) => res.json({ success: true, data: { health: await Health.systemHealth(), metrics: await Health.metrics(), diagnostics: Health.diagnostics() }, requestId: req.id }));
exports.systemHealth = asyncHandler(async (req, res) => res.json({ success: true, data: await Health.systemHealth() }));
exports.providerHealth = asyncHandler(async (req, res) => res.json({ success: true, data: await Health.providerHealth() }));
exports.metrics = asyncHandler(async (req, res) => res.json({ success: true, data: await Health.metrics() }));
exports.history = asyncHandler(async (req, res) => res.json({ success: true, data: await Health.history(req.query) }));
exports.run = asyncHandler(async (req, res) => { Health.clearCache(req.body?.checkId); const data = req.body?.checkId ? await Health.runCheck(req.body.checkId, context(req)) : await Health.runAll(context(req)); res.json({ success: true, message: "Health checks completed.", data }); });
