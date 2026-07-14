const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const adminPage = read("frontend/src/pages/admin/AdminIntegrations.jsx");
const checkoutPage = read("frontend/src/pages/portal/BrowsePlansPage.jsx");
const ordersPage = read("frontend/src/pages/portal/OrdersPage.jsx");
const app = read("backend/src/app.js");
const routes = read("backend/src/routes/orders.js");

assert.match(adminPage, /Run Test Checkout/);
assert.match(adminPage, /Select test product/);
assert.match(adminPage, /Webhook secret saved/);
assert.match(adminPage, /Test checkout completed/);
assert.match(checkoutPage, /orders\/payment-providers/);
assert.match(checkoutPage, /No payment method is currently available/);
assert.match(ordersPage, /Payment processing/);
assert.match(ordersPage, /providerTransactionId/);
assert.ok(app.indexOf('express.raw({ type: "application/json"') < app.indexOf("app.use(express.json"));
assert.match(routes, /router\.get\("\/payment-providers"/);
console.log("PASS visible payment setup, checkout, return, and raw-webhook wiring");
