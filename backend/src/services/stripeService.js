const Stripe = require("stripe");
const crypto = require("crypto");
const IntegrationManager = require("./integrations/IntegrationManager");
const apiSecurityConfig = require("../config/apiSecurity");

let cached = { fingerprint: "", client: null };

async function stripeConfiguration() {
  const config = await IntegrationManager.resolveConfiguration("stripe");
  if (!config.secretKey) {
    const error = new Error("Stripe is not configured.");
    error.code = "PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  return config;
}

async function getStripe() {
  const config = await stripeConfiguration();
  const fingerprint = crypto.createHash("sha256").update(config.secretKey).digest("hex");
  if (!cached.client || cached.fingerprint !== fingerprint) cached = { fingerprint, client: new Stripe(config.secretKey) };
  return { client: cached.client, config };
}

async function createCheckoutSession({ order, productName, planName, successUrl, cancelUrl, customerEmail }) {
  const { client: stripe, config } = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: customerEmail,
    line_items: [{ price_data: { currency: order.currency.toLowerCase(), product_data: { name: `${productName} - ${planName}` }, unit_amount: Math.round(order.amount * 100) }, quantity: 1 }],
    metadata: { orderId: order._id.toString() },
    success_url: config.successUrl || successUrl,
    cancel_url: config.cancelUrl || cancelUrl,
  });
  return session;
}

async function constructWebhookEvent(rawBody, signature) {
  const { client: stripe, config } = await getStripe();
  if (!config.webhookSecret) {
    const error = new Error("Stripe webhook secret is not configured.");
    error.code = "PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret, apiSecurityConfig.webhooks.timestampToleranceSeconds);
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent };
