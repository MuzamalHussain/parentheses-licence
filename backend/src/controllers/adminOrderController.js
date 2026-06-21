const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { AppError } = require("../utils/errorHandler");
const { writeAuditLog } = require("../utils/auditLog");

// GET /api/v1/admin/orders
exports.getOrders = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);

  const filter = {};
  if (req.query.status)  filter.status  = req.query.status;
  if (req.query.gateway) filter.gateway = req.query.gateway;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "name email")
      .populate("productId", "name")
      .populate("planId", "name")
      .populate("licenseId", "licenseKey"),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /api/v1/admin/orders/:id
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("userId", "name email")
    .populate("productId", "name")
    .populate("planId", "name")
    .populate("licenseId", "licenseKey status");
  if (!order) throw new AppError("Order not found.", 404);

  const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: -1 });

  res.json({ success: true, data: { order, payments } });
});

// GET /api/v1/admin/orders/stats
exports.getOrderStats = asyncHandler(async (req, res) => {
  const statusCounts = await Order.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
  ]);

  const stats = { pending: 0, paid: 0, failed: 0, expired: 0, refunded: 0 };
  let totalRevenueUSD = 0;
  statusCounts.forEach(({ _id, count }) => { if (_id in stats) stats[_id] = count; });

  const paidOrders = await Order.find({ status: "paid" }).select("amount currency");
  paidOrders.forEach((o) => { if (o.currency === "USD") totalRevenueUSD += o.amount; });

  res.json({ success: true, data: { stats, totalRevenueUSD } });
});

// POST /api/v1/admin/orders/:id/mark-refunded
// MVP: manual admin-triggered refund flag. Actually issuing the refund
// through the gateway's API is a fast-follow (see plan's deferred items) —
// for now this records the business decision and revokes the license,
// which is the action that actually matters for access control.
exports.markRefunded = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found.", 404);
  if (order.status !== "paid") throw new AppError("Only paid orders can be marked as refunded.", 400);

  order.status = "refunded";
  await order.save();

  let revokedLicense = null;
  if (order.licenseId) {
    const License = require("../models/License");
    revokedLicense = await License.findById(order.licenseId);
    if (revokedLicense && revokedLicense.status !== "revoked") {
      revokedLicense.status = "revoked";
      revokedLicense.revokedAt = new Date();
      revokedLicense.revokedBy = req.user._id;
      await revokedLicense.save();
    }
  }

  await writeAuditLog({
    actor: req.user, action: "order.marked_refunded",
    targetType: "Order", targetId: order._id,
    metadata: { orderId: order._id.toString(), reason: req.body.reason || "", licenseRevoked: !!revokedLicense },
    ip: req.ip,
  });

  res.json({
    success: true,
    message: revokedLicense
      ? "Order marked as refunded and the associated license was revoked."
      : "Order marked as refunded.",
    data: order,
  });
});
