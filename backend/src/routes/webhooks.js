const express = require("express");
const router = express.Router();
const { handleStripeWebhook } = require("../controllers/stripeWebhookController");
const { handleLocalPspWebhook } = require("../controllers/localPspWebhookController");

// NOTE: these routes receive express.raw() body (set in app.js BEFORE
// express.json() is applied globally), because both Stripe and the local
// PSP require the exact raw request bytes to verify their signatures.
// JSON-parsing first would corrupt the signature check.

router.post("/stripe", handleStripeWebhook);
router.post("/local",  handleLocalPspWebhook);

module.exports = router;
