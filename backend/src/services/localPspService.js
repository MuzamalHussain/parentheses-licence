const crypto = require("crypto");
const axios = require("axios");
const { getConfig } = require("../config/env");
const { assertProviderOperational } = require("./paymentProviderStatus");

/**
 * GENERIC adapter for a Pakistan-compatible PSP aggregator
 * (e.g. PayFast PK, SafePay, Bank Alfalah gateway — see execution plan Week 5,
 * Day 4: "evaluate 2-3 PSP aggregators before integrating").
 *
 * This adapter follows the common pattern used by most such aggregators:
 *   1. POST order details to their /checkout/create endpoint -> get a hosted
 *      checkout URL + their own transaction reference.
 *   2. Customer pays on their hosted page (JazzCash / EasyPaisa / card).
 *   3. They POST a webhook back to us, signed with HMAC-SHA256 using a
 *      shared secret, which we verify before trusting the payload.
 *
 * IMPORTANT: Once you've chosen a specific aggregator, replace the endpoint
 * paths and field names below with their actual API spec — the shapes here
 * are a representative placeholder, not a real, tested integration.
 */

function localPspConfig() {
  const { payments } = getConfig();
  return {
    baseUrl: payments.localPspBaseUrl,
    merchantId: payments.localPspMerchantId,
    secretKey: payments.localPspSecretKey,
  };
}

/**
 * Creates a hosted checkout session with the local PSP.
 * Returns { checkoutId, checkoutUrl }.
 */
async function createLocalCheckout({ order, productName, planName, successUrl, cancelUrl, customerEmail, customerName }) {
  assertProviderOperational("local");
  const config = localPspConfig();
  const payload = {
    merchant_id: config.merchantId,
    amount: order.amount,            // PKR, major units (e.g. 13500.00)
    currency: "PKR",
    order_id: order._id.toString(),  // our reference — comes back in the webhook
    description: `${productName} — ${planName}`,
    customer_email: customerEmail,
    customer_name: customerName,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  // Most PK aggregators require an HMAC signature on the outgoing request too.
  const signature = signPayload(payload);

  try {
    const { data } = await axios.post(`${config.baseUrl}/checkout/create`, payload, {
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      timeout: 15000,
    });
    return { checkoutId: data.transaction_id, checkoutUrl: data.checkout_url };
  } catch (err) {
    // Surface a clean error — the controller turns this into a 502 for the client.
    const message = err.response?.data?.message || err.message || "Local gateway request failed.";
    throw new Error(`Local PSP checkout creation failed: ${message}`);
  }
}

/**
 * Signs a payload using HMAC-SHA256 — standard pattern for these aggregators.
 * Field order matters for some providers; adjust to match your chosen PSP's spec.
 */
function signPayload(payload) {
  const config = localPspConfig();
  const ordered = Object.keys(payload).sort().map((k) => `${k}=${payload[k]}`).join("&");
  return crypto.createHmac("sha256", config.secretKey).update(ordered).digest("hex");
}

/**
 * Verifies an inbound webhook's HMAC signature.
 * `rawBody` should be the exact raw string the PSP signed (not re-serialized JSON).
 */
function verifyWebhookSignature(rawBody, receivedSignature) {
  const config = localPspConfig();
  const expected = crypto.createHmac("sha256", config.secretKey).update(rawBody).digest("hex");
  // Timing-safe comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature || "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { createLocalCheckout, verifyWebhookSignature, signPayload };
