const asyncHandler = require("express-async-handler");
const AuditLog = require("../models/AuditLog");

// GET /api/v1/admin/audit
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 30);
  const skip  = (page - 1) * limit;

  const filter = {};
  if (req.query.action)     filter.action     = { $regex: req.query.action, $options: "i" };
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.actorEmail) filter.actorEmail = { $regex: req.query.actorEmail, $options: "i" };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .populate("actorId", "name email role"),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});
