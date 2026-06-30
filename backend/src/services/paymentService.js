const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const License = require("../models/License");
const Plan = require("../models/Plan");
const Coupon = require("../models/Coupon");
const { generateUniqueLicenseKey } = require("../utils/licenseKey");
const { writeAuditLog } = require("../utils/auditLog");
const { sendEmail, emailTemplates } = require("../utils/email");

function normalizeGatewayTransactionId(orderId, paymentDetails) {
  return paymentDetails.gatewayTransactionId || `order:${orderId.toString()}`;
}

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

async function findQueryWithSession(query, session) {
  return session ? query.session(session) : query;
}

async function notifyLicenseIssued({ order, license, paymentDetails }) {
  try {
    const User = require("../models/User");
    const Product = require("../models/Product");
    const [user, product] = await Promise.all([
      User.findById(order.userId),
      Product.findById(order.productId),
    ]);
    if (!user) return;

    const tmpl = emailTemplates.licenseIssued
      ? emailTemplates.licenseIssued(user.name, license.licenseKey, product?.name || "your plugin")
      : {
          subject: `Your license key for ${product?.name || "your purchase"}`,
          html: `<p>Hi ${user.name},</p><p>Thanks for your purchase! Your license key is:</p>
                 <p style="font-family:monospace;font-size:18px;font-weight:bold;">${license.licenseKey}</p>
                 <p>You can view and manage it anytime from your dashboard.</p>`,
        };

    await sendEmail({ to: user.email, ...tmpl });
  } catch (err) {
    console.error("[Payments] License email failed:", {
      orderId: order._id?.toString(),
      gateway: paymentDetails.gateway,
      gatewayTransactionId: paymentDetails.gatewayTransactionId,
      error: err.message,
    });
  }
}

/**
 * The single chokepoint every payment gateway funnels into.
 *
 * Stripe and the local PSP have different webhook shapes, but both adapters
 * extract the same payment facts and call this function. The completion flow is
 * transaction-scoped so order/payment/coupon/license state commits together or
 * rolls back together.
 *
 * @returns {Promise<{order: object, license: object|null, alreadyProcessed: boolean}>}
 */
async function confirmOrderPaid(orderId, paymentDetails) {
  const session = await mongoose.startSession();
  const gatewayTransactionId = normalizeGatewayTransactionId(orderId, paymentDetails);
  let result;
  let shouldSendLicenseEmail = false;

  console.log("[Payments] Completion transaction start", {
    orderId: orderId.toString(),
    gateway: paymentDetails.gateway,
    gatewayTransactionId,
  });

  try {
    await session.withTransaction(async () => {
      const order = await findQueryWithSession(Order.findById(orderId), session);
      if (!order) {
        throw new Error(`confirmOrderPaid: order ${orderId} not found.`);
      }

      if (order.status === "refunded") {
        throw new Error(`confirmOrderPaid: order ${orderId} is already refunded; refusing to re-confirm.`);
      }

      const plan = await findQueryWithSession(Plan.findById(order.planId), session);
      if (!plan) {
        throw new Error(`confirmOrderPaid: plan ${order.planId} not found for order ${order._id}.`);
      }

      let payment = await findQueryWithSession(
        Payment.findOne({ gateway: paymentDetails.gateway, gatewayTransactionId }),
        session
      );

      if (payment && !sameId(payment.orderId, order._id)) {
        throw new Error(
          `confirmOrderPaid: payment ${paymentDetails.gateway}/${gatewayTransactionId} already belongs to another order.`
        );
      }

      let license = null;
      if (order.licenseId) {
        license = await findQueryWithSession(License.findById(order.licenseId), session);
      }
      if (!license) {
        license = await findQueryWithSession(
          License.findOne({
            orderId: order._id,
            userId: order.userId,
            productId: order.productId,
            planId: order.planId,
          }),
          session
        );
      }

      if (order.status === "paid" && payment && license) {
        console.log("[Payments] Completion idempotent replay", {
          orderId: order._id.toString(),
          gateway: paymentDetails.gateway,
          gatewayTransactionId,
        });
        result = { order, license, alreadyProcessed: true };
        return;
      }

      if (!payment) {
        [payment] = await Payment.create(
          [{
            orderId: order._id,
            gateway: paymentDetails.gateway,
            gatewayTransactionId,
            amount: paymentDetails.amount,
            currency: paymentDetails.currency,
            status: "succeeded",
            rawWebhookPayload: paymentDetails.rawWebhookPayload || {},
          }],
          { session }
        );
      }

      const transitionedToPaid = order.status !== "paid";
      if (transitionedToPaid) {
        order.status = "paid";
        order.paidAt = new Date();
        order.gatewayCheckoutId = order.gatewayCheckoutId || gatewayTransactionId;
        await order.save({ session });
      }

      if (transitionedToPaid && order.couponCode) {
        await Coupon.updateOne(
          { code: order.couponCode },
          { $inc: { usedCount: 1 } },
          { session }
        );
      }

      if (!license) {
        const licenseKey = await generateUniqueLicenseKey(License, 10, { session });
        let expiresAt = null;
        if (plan.durationDays && plan.renewalType === "recurring") {
          expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
        }

        [license] = await License.create(
          [{
            licenseKey,
            userId: order.userId,
            productId: order.productId,
            planId: order.planId,
            orderId: order._id,
            allowedSites: plan.allowedSites,
            expiresAt,
            status: "active",
          }],
          { session }
        );

        shouldSendLicenseEmail = true;
      }

      if (!order.licenseId || !sameId(order.licenseId, license._id)) {
        order.licenseId = license._id;
        await order.save({ session });
      }

      await writeAuditLog({
        action: "license.issued_from_payment",
        targetType: "License",
        targetId: license._id,
        metadata: {
          orderId: order._id.toString(),
          licenseKey: license.licenseKey,
          gateway: paymentDetails.gateway,
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
        },
        session,
      });

      result = { order, license, alreadyProcessed: !shouldSendLicenseEmail && !transitionedToPaid };
    });

    console.log("[Payments] Completion transaction commit", {
      orderId: orderId.toString(),
      gateway: paymentDetails.gateway,
      gatewayTransactionId,
    });
  } catch (err) {
    console.error("[Payments] Completion transaction abort", {
      orderId: orderId.toString(),
      gateway: paymentDetails.gateway,
      gatewayTransactionId,
      error: err.message,
    });
    throw err;
  } finally {
    await session.endSession();
  }

  if (shouldSendLicenseEmail && result?.license) {
    await notifyLicenseIssued({ order: result.order, license: result.license, paymentDetails });
  }

  return result;
}

/**
 * Computes the final payable amount for a checkout, applying a coupon if valid.
 * Returns { amount, currency, discountAmount, couponCode } and never mutates the coupon.
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
