const Order = require("../models/Order");
const Payment = require("../models/Payment");
const License = require("../models/License");
const Plan = require("../models/Plan");
const Coupon = require("../models/Coupon");
const { generateUniqueLicenseKey } = require("../utils/licenseKey");
const { writeAuditLog } = require("../utils/auditLog");
const { sendEmail, emailTemplates } = require("../utils/email");

/**
 * The single chokepoint every payment gateway funnels into.
 *
 * Why this exists (architectural decision — see execution plan, Week 5):
 *   Stripe and the local PSP have completely different webhook shapes,
 *   signature schemes, and event names. Without this function, that
 *   complexity leaks into the order/license logic and adding a third
 *   gateway later means re-deriving "what does a successful payment do"
 *   from scratch. Every adapter's only job is: verify the webhook, extract
 *   {orderId, gatewayTransactionId, amount, currency}, then call this.
 *
 * Idempotency (critical — gateways retry webhooks):
 *   Callers MUST check WebhookEvent uniqueness BEFORE calling this function
 *   (see webhookEventGuard in each route). This function additionally
 *   double-checks the order's own status, so even a direct double-call
 *   is safe and will never issue two licenses for one order.
 *
 * @param {string} orderId
 * @param {object} paymentDetails
 * @param {string} paymentDetails.gateway               "stripe" | "local"
 * @param {string} paymentDetails.gatewayTransactionId
 * @param {number} paymentDetails.amount
 * @param {string} paymentDetails.currency
 * @param {object} [paymentDetails.rawWebhookPayload]
 * @returns {Promise<{order: object, license: object|null, alreadyProcessed: boolean}>}
 */
async function confirmOrderPaid(orderId, paymentDetails) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error(`confirmOrderPaid: order ${orderId} not found.`);

  // ── Idempotency guard #2: order-status check ────────────────────────────────
  // If this order is already paid, this is a webhook retry (or a race).
  // Do NOT create a second license. Return the existing state quietly.
  if (order.status === "paid") {
    const existingLicense = order.licenseId ? await License.findById(order.licenseId) : null;
    return { order, license: existingLicense, alreadyProcessed: true };
  }

  if (order.status === "refunded") {
    // Should never happen (a refunded order shouldn't receive a fresh "paid" webhook),
    // but if it does, do not resurrect a license silently — surface it.
    throw new Error(`confirmOrderPaid: order ${orderId} is already refunded — refusing to re-confirm.`);
  }

  // ── Record the payment (always, even if something downstream fails — we want the audit trail) ──
  await Payment.create({
    orderId: order._id,
    gateway: paymentDetails.gateway,
    gatewayTransactionId: paymentDetails.gatewayTransactionId,
    amount: paymentDetails.amount,
    currency: paymentDetails.currency,
    status: "succeeded",
    rawWebhookPayload: paymentDetails.rawWebhookPayload || {},
  });

  // ── Mark order paid ──────────────────────────────────────────────────────────
  order.status = "paid";
  order.paidAt = new Date();
  order.gatewayCheckoutId = order.gatewayCheckoutId || paymentDetails.gatewayTransactionId;
  await order.save();

  // ── Bump coupon usage if one was applied ────────────────────────────────────
  if (order.couponCode) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
  }

  // ── Issue the license ────────────────────────────────────────────────────────
  const plan = await Plan.findById(order.planId);
  if (!plan) {
    // Order paid but plan vanished (shouldn't happen) — log loudly, don't crash the webhook.
    await writeAuditLog({
      action: "order.paid_but_plan_missing",
      targetType: "Order", targetId: order._id,
      metadata: { orderId: order._id.toString(), planId: order.planId?.toString() },
    });
    return { order, license: null, alreadyProcessed: false };
  }

  const licenseKey = await generateUniqueLicenseKey(License);

  let expiresAt = null;
  if (plan.durationDays && plan.renewalType === "recurring") {
    expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
  }

  const license = await License.create({
    licenseKey,
    userId: order.userId,
    productId: order.productId,
    planId: order.planId,
    orderId: order._id,
    allowedSites: plan.allowedSites,
    expiresAt,
    status: "active",
  });

  order.licenseId = license._id;
  await order.save();

  await writeAuditLog({
    action: "license.issued_from_payment",
    targetType: "License", targetId: license._id,
    metadata: {
      orderId: order._id.toString(),
      licenseKey,
      gateway: paymentDetails.gateway,
      amount: paymentDetails.amount,
      currency: paymentDetails.currency,
    },
  });

  // ── Notify the customer (non-blocking — payment success must not fail on email) ──
  try {
    const User = require("../models/User");
    const Product = require("../models/Product");
    const [user, product] = await Promise.all([
      User.findById(order.userId),
      Product.findById(order.productId),
    ]);
    if (user) {
      const tmpl = emailTemplates.licenseIssued
        ? emailTemplates.licenseIssued(user.name, licenseKey, product?.name || "your plugin")
        : {
            subject: `Your license key for ${product?.name || "your purchase"}`,
            html: `<p>Hi ${user.name},</p><p>Thanks for your purchase! Your license key is:</p>
                   <p style="font-family:monospace;font-size:18px;font-weight:bold;">${licenseKey}</p>
                   <p>You can view and manage it anytime from your dashboard.</p>`,
          };
      await sendEmail({ to: user.email, ...tmpl });
    }
  } catch (err) {
    console.error("[Payments] License email failed:", err.message);
  }

  return { order, license, alreadyProcessed: false };
}

/**
 * Computes the final payable amount for a checkout, applying a coupon if valid.
 * Returns { amount, currency, discountAmount, couponCode } — never mutates the coupon.
 */
async function computeCheckoutAmount({ plan, currency, couponCode }) {
  const baseAmount = currency === "USD" ? plan.priceUSD : plan.priceLocal;
  let discountAmount = 0;
  let appliedCode = "";

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
    if (coupon && coupon.isValid()) {
      discountAmount = coupon.computeDiscount(baseAmount);
      appliedCode = coupon.code;
    }
  }

  const amount = Math.max(0, Math.round((baseAmount - discountAmount) * 100) / 100);
  return { amount, currency, discountAmount, couponCode: appliedCode };
}

module.exports = { confirmOrderPaid, computeCheckoutAmount };
