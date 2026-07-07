const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { confirmOrderPaid } = require("./paymentService");
const { registry } = require("./paymentProviderRegistry");
const {
  beginWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
} = require("../utils/webhookGuard");
const { writeAuditLog } = require("../utils/auditLog");
const { logInfo } = require("../utils/logger");

const PAYMENT_STATES = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
};

function assertPaymentMatchesOrder(order, event) {
  if (!order) return;
  if (event.amount && Number(order.amount) && Math.abs(Number(order.amount) - Number(event.amount)) > 0.009) {
    throw new Error("Payment amount does not match order total.");
  }
  if (event.currency && order.currency && String(order.currency).toUpperCase() !== String(event.currency).toUpperCase()) {
    throw new Error("Payment currency does not match order currency.");
  }
}

async function auditPayment(action, event, order = null, req = null) {
  await writeAuditLog({
    action,
    targetType: order ? "Order" : "Payment",
    targetId: order?._id || null,
    metadata: {
      provider: event.provider,
      eventId: event.eventId,
      eventType: event.eventType,
      transactionId: event.transactionId,
      orderId: event.orderId,
      amount: event.amount,
      currency: event.currency,
    },
    ip: req?.ip,
  });
}

async function createCheckoutSession(providerId, args) {
  const provider = registry.get(providerId);
  const session = await provider.createCheckoutSession(args);
  await auditPayment("payment.started", {
    provider: providerId,
    eventId: session.sessionId,
    eventType: "checkout.session.created",
    transactionId: session.sessionId,
    orderId: args.order?._id,
    amount: args.order?.amount,
    currency: args.order?.currency,
  }, args.order);
  return session;
}

function parseWebhookEvent(providerId, { rawBody, headers }) {
  return registry.get(providerId).parseWebhookEvent({ rawBody, headers });
}

async function recordFailedPayment(event, order = null) {
  if (event.orderId) {
    await Order.updateOne(
      { _id: event.orderId, status: { $in: ["draft", "pending", "processing"] } },
      { status: "failed", paymentStatus: PAYMENT_STATES.FAILED, failureReason: event.failureReason || "Payment failed." }
    );
  } else if (event.sessionId || event.transactionId) {
    await Order.updateOne(
      { gatewayCheckoutId: event.sessionId || event.transactionId, status: { $in: ["draft", "pending", "processing"] } },
      { status: "failed", paymentStatus: PAYMENT_STATES.FAILED, failureReason: event.failureReason || "Payment failed." }
    );
  }
  await auditPayment("payment.failed", event, order);
}

async function recordCancelledPayment(event, order = null) {
  if (event.orderId) {
    await Order.updateOne(
      { _id: event.orderId, status: { $in: ["draft", "pending", "processing"] } },
      { status: "cancelled", paymentStatus: PAYMENT_STATES.CANCELLED, cancelledAt: new Date() }
    );
  }
  await auditPayment("payment.cancelled", event, order);
}

async function recordRefund(event, order = null) {
  const query = event.orderId
    ? { _id: event.orderId }
    : { gatewayCheckoutId: event.transactionId };
  await Order.updateOne(query, { status: "refunded", paymentStatus: PAYMENT_STATES.REFUNDED, refundedAt: new Date() });
  await Payment.updateOne(
    { gateway: event.provider, gatewayTransactionId: event.transactionId },
    { status: "refunded", providerEventId: event.eventId },
    { upsert: false }
  );
  await auditPayment("payment.refunded", event, order);
}

async function processWebhookEvent(event, req = null) {
  logInfo(`${event.provider}_webhook.received`, {
    eventId: event.eventId,
    eventType: event.eventType,
    status: "received",
  });

  const { shouldProcess, status, attempt } = await beginWebhookProcessing({
    gateway: event.provider,
    eventId: event.eventId,
    eventType: event.eventType,
    payload: event.raw,
  });

  if (!shouldProcess) {
    logInfo(`${event.provider}_webhook.duplicate`, {
      eventId: event.eventId,
      eventType: event.eventType,
      status: "duplicate",
      existingStatus: status,
    });
    return { duplicate: true, status };
  }

  try {
    logInfo(`${event.provider}_webhook.processing_started`, {
      eventId: event.eventId,
      eventType: event.eventType,
      status: "processing_started",
      attempt,
    });

    let order = null;
    if (event.orderId && typeof Order.findById === "function") order = await Order.findById(event.orderId);

    if (event.action === "payment.succeeded") {
      if (!event.orderId) throw new Error("Payment success event missing order id.");
      assertPaymentMatchesOrder(order, event);
      await confirmOrderPaid(event.orderId, {
        gateway: event.provider,
        gatewayTransactionId: event.transactionId,
        amount: event.amount,
        currency: event.currency,
        rawWebhookPayload: event.raw,
      });
      await auditPayment("payment.completed", event, order, req);
    } else if (event.action === "payment.failed") {
      await recordFailedPayment(event, order);
    } else if (event.action === "payment.cancelled") {
      await recordCancelledPayment(event, order);
    } else if (event.action === "payment.refunded") {
      await recordRefund(event, order);
    }

    await markWebhookProcessed(event.provider, event.eventId);
    logInfo(`${event.provider}_webhook.processing_completed`, {
      eventId: event.eventId,
      eventType: event.eventType,
      status: "processing_completed",
    });
    return { duplicate: false, ignored: event.action === "ignored" };
  } catch (err) {
    await markWebhookFailed(event.provider, event.eventId, err.message);
    throw err;
  }
}

module.exports = {
  PAYMENT_STATES,
  createCheckoutSession,
  parseWebhookEvent,
  processWebhookEvent,
  assertPaymentMatchesOrder,
  registry,
};
