const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const License = require("../models/License");
const AuditLog = require("../models/AuditLog");

exports.getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalCustomers,
    licenseStatusCounts,
    recentLicenses,
    recentAuditLogs,
    newCustomers30d,
  ] = await Promise.all([
    User.countDocuments({ role: "customer" }),

    License.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    License.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId",    "name email")
      .populate("productId", "name"),

    AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("actorId", "name email"),

    User.countDocuments({
      role: "customer",
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  const licenseStats = { active: 0, suspended: 0, revoked: 0, expired: 0, total: 0 };
  licenseStatusCounts.forEach(({ _id, count }) => {
    if (_id in licenseStats) licenseStats[_id] = count;
    licenseStats.total += count;
  });

  res.json({
    success: true,
    data: {
      customers: { total: totalCustomers, newLast30Days: newCustomers30d },
      licenses: licenseStats,
      recentLicenses,
      recentAuditLogs,
    },
  });
});
