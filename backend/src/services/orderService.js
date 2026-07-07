const crypto = require("crypto");
const Order = require("../models/Order");
const License = require("../models/License");
const Plan = require("../models/Plan");
const Product = require("../models/Product");
const { AppError } = require("../utils/errorHandler");
const { generateUniqueLicenseKey } = require("../utils/licenseKey");
const { writeAuditLog } = require("../utils/auditLog");

const ORDER_STATUSES = ["draft", "pending", "processing", "completed", "paid", "cancelled", "failed", "expired", "refunded"];
const COMPLETED_STATUSES = ["completed", "paid"];
const CANCELLABLE_STATUSES = ["draft", "pending", "processing"];

function normalizeCurrency(currency = "USD") {
  const normalized = String(currency || "USD").trim().toUpperCase();
  if (!["USD", "PKR", "EUR", "GBP"].includes(normalized)) throw new AppError("Unsupported currency.", 422);
  return normalized;
}

function checkoutSessionId() {
  return `chk_${crypto.randomBytes(18).toString("hex")}`;
}

function assertTotals({ subtotal, discountAmount = 0, taxAmount = 0, grandTotal }) {
  const expected = Math.max(0, Math.round((subtotal + taxAmount - discountAmount) * 100) / 100);
  if (Math.abs(expected - grandTotal) > 0.009) throw new AppError("Order totals are invalid.", 422);
}

async function buildOrderItems({ items, currency }) {
  if (!items?.length) throw new AppError("At least one order item is required.", 422);
  const built = [];
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const [product, plan] = await Promise.all([
      Product.findById(item.productId),
      Plan.findOne({ _id: item.planId, productId: item.productId, isActive: true }),
    ]);
    if (!product) throw new AppError("Product not found.", 404);
    if (!plan) throw new AppError("Plan not found or inactive.", 404);
    const unitPrice = currency === "PKR" ? plan.priceLocal : plan.priceUSD;
    const subtotal = Math.round(unitPrice * quantity * 100) / 100;
    built.push({
      productId: product._id,
      planId: plan._id,
      productName: product.name,
      planName: plan.name,
      purchasedVersion: item.purchasedVersion || "",
      quantity,
      unitPrice,
      subtotal,
      plan,
      product,
    });
  }
  return built;
}

async function createCheckoutOrder({ user, items, currency = "USD", couponCode = "", billingDetails = {}, req }) {
  const normalizedCurrency = normalizeCurrency(currency);
  const built = await buildOrderItems({ items, currency: normalizedCurrency });
  const subtotal = Math.round(built.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  const discountAmount = 0;
  const taxAmount = 0;
  const grandTotal = Math.max(0, subtotal + taxAmount - discountAmount);
  assertTotals({ subtotal, discountAmount, taxAmount, grandTotal });

  const order = await Order.create({
    userId: user._id,
    productId: built[0].productId,
    planId: built[0].planId,
    items: built.map(({ plan, product, ...item }) => item),
    amount: grandTotal,
    subtotal,
    taxAmount,
    discountAmount,
    grandTotal,
    currency: normalizedCurrency,
    gateway: "none",
    paymentProvider: "provider_hook_pending",
    checkoutSessionId: checkoutSessionId(),
    couponCode,
    couponProvider: "internal_hook_pending",
    taxProvider: "manual_hook_pending",
    status: "draft",
    paymentStatus: "unpaid",
    billingDetails,
    customerDetails: {
      name: user.name || "",
      email: user.email || "",
      ipAddress: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
    },
  });

  await writeAuditLog({
    actor: user,
    action: "order.created",
    targetType: "Order",
    targetId: order._id,
    metadata: { orderNumber: order.orderNumber, subtotal, grandTotal, currency: normalizedCurrency },
    ip: req?.ip,
  });
  return order;
}

function assertStatusTransition(order, nextStatus) {
  if (!ORDER_STATUSES.includes(nextStatus)) throw new AppError("Invalid order status.", 422);
  if (order.status === "refunded" && nextStatus !== "refunded") throw new AppError("Refunded orders cannot transition.", 400);
  if (COMPLETED_STATUSES.includes(order.status) && ["draft", "pending", "processing"].includes(nextStatus)) {
    throw new AppError("Completed orders cannot move backward.", 400);
  }
  if (order.status === "cancelled" && nextStatus !== "cancelled") throw new AppError("Cancelled orders cannot transition.", 400);
}

async function issueLicensesForOrder({ order, actor = null, req = null }) {
  const created = [];
  for (const item of order.items || []) {
    if (item.licenseId) continue;
    const plan = await Plan.findById(item.planId);
    if (!plan) throw new AppError("Plan not found for order item.", 404);
    const licenseKey = await generateUniqueLicenseKey(License);
    let expiresAt = null;
    if (plan.durationDays && plan.renewalType === "recurring") {
      expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
    }
    const license = await License.create({
      licenseKey,
      userId: order.userId,
      productId: item.productId,
      planId: item.planId,
      orderId: order._id,
      allowedSites: plan.allowedSites,
      licenseType: licenseTypeForPlan(plan),
      expiresAt,
      status: plan.planType === "trial" ? "trial" : plan.planType === "lifetime" ? "lifetime" : "active",
      subscription: {
        status: plan.renewalType === "recurring" ? "manual" : "none",
        renewalDate: expiresAt,
        nextBillingAt: null,
        manualRenewal: true,
        autoRenew: false,
      },
      renewal: {
        eligible: plan.renewalType === "recurring",
        autoRenew: false,
        nextRenewalAt: expiresAt,
      },
    });
    item.licenseId = license._id;
    if (!order.licenseId) order.licenseId = license._id;
    created.push(license);
    await writeAuditLog({
      actor,
      action: "license.issued_from_order",
      targetType: "License",
      targetId: license._id,
      metadata: { orderId: order._id, orderNumber: order.orderNumber, licenseKey },
      ip: req?.ip,
    });
  }
  return created;
}

function licenseTypeForPlan(plan) {
  if (["trial", "lifetime"].includes(plan.planType)) return plan.allowedSites === 0 ? "unlimited" : "single_site";
  if (plan.planType === "custom") return "custom";
  return plan.planType || (plan.allowedSites === 0 ? "unlimited" : "single_site");
}

async function transitionOrder({ order, status, actor = null, req = null, reason = "" }) {
  if (!order) throw new AppError("Order not found.", 404);
  assertStatusTransition(order, status);
  const previousStatus = order.status;
  order.status = status;
  if (status === "processing") order.paymentStatus = "pending";
  if (COMPLETED_STATUSES.includes(status)) {
    assertTotals({
      subtotal: order.subtotal || 0,
      taxAmount: order.taxAmount || 0,
      discountAmount: order.discountAmount || 0,
      grandTotal: order.grandTotal ?? order.amount ?? 0,
    });
    order.status = "completed";
    order.paymentStatus = "paid";
    order.paidAt = order.paidAt || new Date();
    order.completedAt = order.completedAt || new Date();
    await issueLicensesForOrder({ order, actor, req });
  }
  if (status === "cancelled") {
    if (!CANCELLABLE_STATUSES.includes(previousStatus)) throw new AppError("Only draft, pending, or processing orders can be cancelled.", 400);
    order.paymentStatus = "cancelled";
    order.cancelledAt = new Date();
  }
  if (status === "failed") order.paymentStatus = "failed";
  if (status === "refunded") {
    if (!COMPLETED_STATUSES.includes(previousStatus)) throw new AppError("Only completed orders can be refunded.", 400);
    order.paymentStatus = "refunded";
    order.refundedAt = new Date();
  }
  await order.save();
  await writeAuditLog({
    actor,
    action: `order.${order.status}`,
    targetType: "Order",
    targetId: order._id,
    metadata: { orderNumber: order.orderNumber, previousStatus, status: order.status, reason },
    ip: req?.ip,
  });
  return order;
}

function orderAccessPayload(order) {
  return {
    ...order,
    downloadEligible: Boolean(order.licenseId),
    renewalEligible: Boolean(order.licenseId),
  };
}

module.exports = {
  ORDER_STATUSES,
  createCheckoutOrder,
  transitionOrder,
  issueLicensesForOrder,
  assertStatusTransition,
  assertTotals,
  orderAccessPayload,
  licenseTypeForPlan,
};
