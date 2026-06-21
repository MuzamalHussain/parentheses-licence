const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Plan = require("../models/Plan");
const Product = require("../models/Product");
const { AppError } = require("../utils/errorHandler");
const { computeCheckoutAmount } = require("../services/paymentService");
const { createCheckoutSession } = require("../services/stripeService");
const { createLocalCheckout } = require("../services/localPspService");
const { getConfig } = require("../config/env");

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/orders/checkout
// Body: { productId, planId, gateway: "stripe"|"local", couponCode? }
// Creates a pending Order, then a gateway-hosted checkout session, and
// returns the URL the frontend should redirect the customer to.
// ─────────────────────────────────────────────────────────────────────────────
exports.createCheckout = asyncHandler(async (req, res) => {
  const { productId, planId, gateway, couponCode } = req.body;

  if (!["stripe", "local"].includes(gateway)) {
    throw new AppError("gateway must be 'stripe' or 'local'.", 422);
  }

  const [product, plan] = await Promise.all([
    Product.findById(productId),
    Plan.findOne({ _id: planId, productId, isActive: true }),
  ]);
  if (!product) throw new AppError("Product not found.", 404);
  if (!plan)    throw new AppError("Plan not found or inactive.", 404);

  // Stripe is charged in USD; the local PSP is charged in PKR — currency
  // follows the chosen gateway, not customer preference, since each
  // gateway only settles in one currency for this MVP.
  const currency = gateway === "stripe" ? "USD" : "PKR";

  const { amount, discountAmount, couponCode: appliedCoupon } =
    await computeCheckoutAmount({ plan, currency, couponCode });

  if (amount <= 0) {
    throw new AppError("Order amount must be greater than zero after discount.", 422);
  }

  const order = await Order.create({
    userId: req.user._id,
    productId,
    planId,
    amount,
    currency,
    gateway,
    couponCode: appliedCoupon,
    discountAmount,
    status: "pending",
  });

  const clientUrl = getConfig().app.clientOrigins[0];
  const successUrl = `${clientUrl}/dashboard/orders?status=success&orderId=${order._id}`;
  const cancelUrl  = `${clientUrl}/dashboard/orders?status=cancelled&orderId=${order._id}`;

  let checkoutUrl;
  try {
    if (gateway === "stripe") {
      const session = await createCheckoutSession({
        order,
        productName: product.name,
        planName: plan.name,
        successUrl,
        cancelUrl,
        customerEmail: req.user.email,
      });
      order.gatewayCheckoutId = session.id;
      checkoutUrl = session.url;
    } else {
      const session = await createLocalCheckout({
        order,
        productName: product.name,
        planName: plan.name,
        successUrl,
        cancelUrl,
        customerEmail: req.user.email,
        customerName: req.user.name,
      });
      order.gatewayCheckoutId = session.checkoutId;
      checkoutUrl = session.checkoutUrl;
    }
    await order.save();
  } catch (err) {
    order.status = "failed";
    order.failureReason = err.message;
    await order.save();
    throw new AppError(`Could not start checkout: ${err.message}`, 502);
  }

  res.status(201).json({
    success: true,
    data: {
      orderId: order._id,
      checkoutUrl,
      amount,
      currency,
      discountAmount,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/orders  — customer's own orders
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyOrders = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);

  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/orders/:id — single order detail + status (for polling after redirect)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
    .populate("productId", "name")
    .populate("planId", "name")
    .populate("licenseId", "licenseKey");
  if (!order) throw new AppError("Order not found.", 404);
  res.json({ success: true, data: order });
});
