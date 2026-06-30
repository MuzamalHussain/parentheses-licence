const Stripe = require("stripe");
const { getConfig } = require("../config/env");
const { assertProviderOperational } = require("./paymentProviderStatus");

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const config = getConfig();
    if (!config.payments.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set in .env");
    }
    stripeClient = new Stripe(config.payments.stripeSecretKey);
  }
  return stripeClient;
}

/**
 * Creates a Stripe Checkout Session for an order.
 * Order amount is already in major units (e.g. dollars) — Stripe wants cents.
 */
async function createCheckoutSession({ order, productName, planName, successUrl, cancelUrl, customerEmail }) {
  assertProviderOperational("stripe");
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: {
            name: `${productName} — ${planName}`,
          },
          unit_amount: Math.round(order.amount * 100), // major units -> minor units
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId: order._id.toString(),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session; // session.id, session.url
}

/**
 * Verifies a Stripe webhook signature and constructs the event.
 * Throws if the signature is invalid — callers must catch and return 400.
 */
function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  const config = getConfig();
  if (!config.payments.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set in .env");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.payments.stripeWebhookSecret);
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent };
