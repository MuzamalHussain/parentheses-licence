const asyncHandler = require("express-async-handler");
const AuditLog = require("../models/AuditLog");
const { getPagination, paginationMeta } = require("../utils/pagination");

// GET /api/v1/admin/audit
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 30 });

  const filter = {};
  if (req.query.action)     filter.action     = { $regex: req.query.action, $options: "i" };
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.actorEmail) filter.actorEmail = { $regex: req.query.actorEmail, $options: "i" };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .populate("actorId", "name email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: paginationMeta({ page, limit, total }),
  });
});
