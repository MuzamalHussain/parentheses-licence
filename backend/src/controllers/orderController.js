const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Plan = require("../models/Plan");
const Product = require("../models/Product");
const { AppError } = require("../utils/errorHandler");
const { computeCheckoutAmount } = require("../services/paymentService");
const Integration = require("../models/Integration");
const { getConfig } = require("../config/env");
const { getPagination, paginationMeta } = require("../utils/pagination");
const performanceConfig = require("../config/performance");
const orderService = require("../services/orderService");
const paymentManager = require("../services/paymentManager");

const PAYMENT_PROVIDERS = {
  stripe: { name: "Stripe Checkout", currencies: ["USD", "PKR", "EUR", "GBP"], automaticCheckout: true },
  wise_business: { name: "Wise Business", currencies: ["USD", "PKR", "EUR", "GBP"], automaticCheckout: false },
  hblpay_checkout: { name: "HBLPay Checkout", currencies: ["PKR"], automaticCheckout: false },
};

async function providerAvailability(providerId) {
  const definition = PAYMENT_PROVIDERS[providerId];
  if (!definition) return null;
  const integration = await Integration.findOne({ providerId }).lean();
  const available = Boolean(definition.automaticCheckout && integration?.enabled && integration?.status === "connected" && integration?.health?.status === "ok");
  return { id: providerId, ...definition, available, status: integration?.status || "unconfigured",
    message: available ? "Available" : providerId === "wise_business" ? "Automatic customer payment confirmation is not available for this Wise configuration." : providerId === "hblpay_checkout" ? "HBLPay merchant callback verification is not yet approved." : "Provider is not configured, healthy, and enabled." };
}

async function assertCheckoutEligible(providerId) {
  const status = await providerAvailability(providerId);
  if (!status) throw new AppError("Unsupported payment provider.", 422, "PROVIDER_NOT_CONFIGURED");
  if (!status.automaticCheckout) throw new AppError(status.message, 409, "PROVIDER_CAPABILITY_UNAVAILABLE");
  if (!status.available) throw new AppError(status.message, 503, "PROVIDER_UNHEALTHY");
  return status;
}

exports.getAvailablePaymentProviders = asyncHandler(async (req, res) => {
  const providers = await Promise.all(Object.keys(PAYMENT_PROVIDERS).map(providerAvailability));
  res.json({ success: true, data: providers.filter((provider) => provider.available).map(({ id, name, currencies }) => ({ id, name, currencies })) });
});

exports.createCheckoutFoundation = asyncHandler(async (req, res) => {
  const order = await orderService.createCheckoutOrder({
    user: req.user,
    items: req.body.items,
    currency: req.body.currency || "USD",
    couponCode: req.body.couponCode || "",
    billingDetails: req.body.billingDetails || {},
    req,
  });

  res.status(201).json({
    success: true,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      checkoutSessionId: order.checkoutSessionId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      grandTotal: order.grandTotal,
      currency: order.currency,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/orders/checkout
// Body: { productId, planId, gateway: "stripe"|"local", couponCode? }
// Creates a pending Order, then a gateway-hosted checkout session, and
// returns the URL the frontend should redirect the customer to.
// ─────────────────────────────────────────────────────────────────────────────
exports.createCheckout = asyncHandler(async (req, res) => {
  const { productId, planId, gateway, couponCode } = req.body;

  await assertCheckoutEligible(gateway);

  const [product, plan] = await Promise.all([
    Product.findById(productId),
    Plan.findOne({ _id: planId, productId, isActive: true }),
  ]);
  if (!product) throw new AppError("Product not found.", 404);
  if (!plan)    throw new AppError("Plan not found or inactive.", 404);

  // Stripe is charged in USD; the local PSP is charged in PKR — currency
  // follows the chosen gateway, not customer preference, since each
  // gateway only settles in one currency for this MVP.
  const integration = await Integration.findOne({ providerId: gateway }).lean();
  const currency = PAYMENT_PROVIDERS[gateway].currencies.includes(integration?.configuration?.currency)
    ? integration.configuration.currency : gateway === "hblpay_checkout" ? "PKR" : "USD";

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
    isTestPayment: gateway === "stripe" && integration?.configuration?.environment === "test",
  });

  const clientUrl = getConfig().app.clientOrigins[0];
  const successUrl = `${clientUrl}/dashboard/orders?status=success&orderId=${order._id}`;
  const cancelUrl  = `${clientUrl}/dashboard/orders?status=cancelled&orderId=${order._id}`;

  let checkoutSession;
  try {
    checkoutSession = await paymentManager.createCheckoutSession(gateway, {
      order,
      productName: product.name,
      planName: plan.name,
      successUrl,
      cancelUrl,
      customerEmail: req.user.email,
      customerName: req.user.name,
    });
    order.gatewayCheckoutId = checkoutSession.sessionId;
    order.checkoutSessionId = order.checkoutSessionId || checkoutSession.sessionId;
    order.paymentProvider = gateway;
    order.paymentStatus = "pending";
    await order.save();
  } catch (err) {
    order.status = "failed";
    order.paymentStatus = "failed";
    order.failureReason = err.message;
    await order.save();
    throw new AppError(`Could not start checkout: ${err.message}`, 502);
  }

  res.status(201).json({
    success: true,
    data: {
      orderId: order._id,
      checkoutUrl: checkoutSession.checkoutUrl,
      checkoutSessionId: checkoutSession.sessionId,
      expiresAt: checkoutSession.expiresAt,
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
  const { page, limit, skip } = getPagination(req.query, {
    maxLimit: performanceConfig.pagination.customerMaxLimit,
  });

  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/orders/:id — single order detail + status (for polling after redirect)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
    .populate("productId", "name")
    .populate("planId", "name")
    .populate("licenseId", "licenseKey status")
    .lean();
  if (!order) throw new AppError("Order not found.", 404);
  const payment = await require("../models/Payment").findOne({ orderId: order._id, status: "succeeded" }).select("gatewayTransactionId").lean();
  res.json({ success: true, data: { ...orderService.orderAccessPayload(order), providerTransactionId: payment?.gatewayTransactionId || "" } });
});

exports.retryPayment = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
    .populate("productId", "name")
    .populate("planId", "name");
  if (!order) throw new AppError("Order not found.", 404);
  if (!["draft", "pending", "failed", "cancelled", "expired"].includes(order.status)) {
    throw new AppError("This order cannot be retried.", 400);
  }
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_PROVIDERS, order.gateway)) {
    throw new AppError("This order does not have a retryable payment provider.", 400);
  }

  await assertCheckoutEligible(order.gateway);
  const clientUrl = getConfig().app.clientOrigins[0];
  const successUrl = `${clientUrl}/dashboard/orders?status=success&orderId=${order._id}`;
  const cancelUrl = `${clientUrl}/dashboard/orders?status=cancelled&orderId=${order._id}`;
  const checkoutSession = await paymentManager.createCheckoutSession(order.gateway, {
    order,
    productName: order.productId?.name || "Product",
    planName: order.planId?.name || "Plan",
    successUrl,
    cancelUrl,
    customerEmail: req.user.email,
    customerName: req.user.name,
  });

  order.status = "pending";
  order.paymentStatus = "pending";
  order.gatewayCheckoutId = checkoutSession.sessionId;
  order.checkoutSessionId = checkoutSession.sessionId;
  order.failureReason = "";
  await order.save();

  res.json({
    success: true,
    data: {
      orderId: order._id,
      checkoutUrl: checkoutSession.checkoutUrl,
      checkoutSessionId: checkoutSession.sessionId,
      expiresAt: checkoutSession.expiresAt,
    },
  });
});
