const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { AppError } = require("../utils/errorHandler");
const { writeAuditLog } = require("../utils/auditLog");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { getCached } = require("../utils/ttlCache");
const performanceConfig = require("../config/performance");
const orderService = require("../services/orderService");

// GET /api/v1/admin/orders
exports.getOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.gateway) filter.gateway = req.query.gateway;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.search) {
    const pattern = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ orderNumber: pattern }, { gatewayCheckoutId: pattern }, { checkoutSessionId: pattern }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email")
      .populate("productId", "name")
      .populate("planId", "name")
      .populate("licenseId", "licenseKey status")
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: orders.map(orderService.orderAccessPayload),
    pagination: paginationMeta({ page, limit, total }),
  });
});

// GET /api/v1/admin/orders/:id
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("userId", "name email")
    .populate("productId", "name")
    .populate("planId", "name")
    .populate("licenseId", "licenseKey status")
    .lean();
  if (!order) throw new AppError("Order not found.", 404);

  const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: -1 }).lean();

  res.json({ success: true, data: { order, payments } });
});

// GET /api/v1/admin/orders/stats
exports.getOrderStats = asyncHandler(async (req, res) => {
  const data = await getCached("admin:orders:stats:v1", performanceConfig.cache.statsTtlMs, async () => {
    const statusCounts = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenueUSD: {
            $sum: {
              $cond: [
                { $and: [{ $in: ["$status", ["paid", "completed"]] }, { $eq: ["$currency", "USD"] }] },
                { $ifNull: ["$grandTotal", "$amount"] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const stats = { draft: 0, pending: 0, processing: 0, completed: 0, paid: 0, cancelled: 0, failed: 0, expired: 0, refunded: 0 };
    let totalRevenueUSD = 0;
    statusCounts.forEach(({ _id, count, totalRevenueUSD: revenue }) => {
      if (_id in stats) stats[_id] = count;
      totalRevenueUSD += revenue || 0;
    });
    return { stats, totalRevenueUSD };
  });

  res.json({ success: true, data });
});

// POST /api/v1/admin/orders/:id/mark-refunded
// MVP: manual admin-triggered refund flag. Actually issuing the refund
// through the gateway's API is a fast-follow (see plan's deferred items) —
// for now this records the business decision and revokes the license,
// which is the action that actually matters for access control.
exports.markRefunded = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found.", 404);
  if (!["paid", "completed"].includes(order.status)) throw new AppError("Only completed orders can be marked as refunded.", 400);

  await orderService.transitionOrder({ order, status: "refunded", actor: req.user, req, reason: req.body.reason || "" });

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
    actor: req.user, action: "order.refunded",
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

exports.changeStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found.", 404);
  const updated = await orderService.transitionOrder({
    order,
    status: req.body.status,
    actor: req.user,
    req,
    reason: req.body.reason || "",
  });
  res.json({ success: true, message: "Order status updated.", data: updated });
});

exports.completeOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found.", 404);
  const updated = await orderService.transitionOrder({
    order,
    status: "completed",
    actor: req.user,
    req,
    reason: req.body.reason || "manual_completion",
  });
  res.json({ success: true, message: "Order completed.", data: updated });
});

exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found.", 404);
  const updated = await orderService.transitionOrder({
    order,
    status: "cancelled",
    actor: req.user,
    req,
    reason: req.body.reason || "manual_cancellation",
  });
  res.json({ success: true, message: "Order cancelled.", data: updated });
});
