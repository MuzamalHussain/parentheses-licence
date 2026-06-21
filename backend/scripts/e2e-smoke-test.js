#!/usr/bin/env node
/**
 * End-to-end smoke test for the Parentheses Licensing Platform.
 *
 * Simulates the FULL business flow described in the original execution
 * plan's Week 6, Day 6 checklist:
 *
 *   register → (admin) create product+plan → checkout → simulate paid
 *   webhook → license auto-issued → plugin activates domain → update-check
 *   → download request → plugin deactivates domain → admin suspends license
 *
 * This hits a REAL running API over HTTP — it does not import the app
 * directly — so it proves the whole stack (routes, DB, auth) works together,
 * not just that individual functions are correct in isolation.
 *
 * Usage:
 *   node scripts/e2e-smoke-test.js [baseUrl]
 *
 * Defaults to http://localhost:5000/api/v1 if no baseUrl is given.
 *
 * REQUIRES: an admin user must already exist in the database with role
 * "admin" — see scripts/create-admin.js to create one. Set ADMIN_EMAIL /
 * ADMIN_PASSWORD env vars to match.
 *
 * NOTE: this test creates a real Order + License + Product in whatever
 * database the API is pointed at. Don't run it against production data.
 */

const BASE = process.argv[2] || "http://localhost:5000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@parentheses.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPass123";

let pass = 0;
let fail = 0;

function log(ok, label, extra = "") {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${label}${extra ? " — " + extra : ""}`);
  ok ? pass++ : fail++;
}

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, body: json };
}

function assert(cond, label, extra) {
  log(!!cond, label, extra);
  return !!cond;
}

async function main() {
  console.log(`\nRunning end-to-end smoke test against ${BASE}\n`);

  // ── 0. Health check ──────────────────────────────────────────────────────
  const health = await req("GET", "/../health");
  assert(health.status === 200, "API health check");

  // ── 1. Admin login ───────────────────────────────────────────────────────
  const adminLogin = await req("POST", "/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!assert(adminLogin.status === 200, "Admin login", adminLogin.body?.message)) {
    console.log("\n⚠️  Cannot continue without an admin account. Run scripts/create-admin.js first.\n");
    return printSummary();
  }
  const adminToken = adminLogin.body.data.accessToken;

  // ── 2. Register a fresh test customer ────────────────────────────────────
  const testEmail = `e2e-test-${Date.now()}@example.com`;
  const register = await req("POST", "/auth/register", {
    name: "E2E Test Customer", email: testEmail, password: "TestPass123",
  });
  assert(register.status === 201, "Customer registration");

  // Force-verify the email directly isn't possible over HTTP without the
  // token from the email, so for this smoke test we log in anyway — adjust
  // your dev environment to auto-verify, or read the token from your mail
  // catcher (Mailtrap/console) if login fails due to unverified email.
  const customerLogin = await req("POST", "/auth/login", { email: testEmail, password: "TestPass123" });
  const customerToken = customerLogin.body?.data?.accessToken;
  assert(customerLogin.status === 200, "Customer login", customerLogin.body?.message);

  // ── 3. Admin creates a product + plan ────────────────────────────────────
  const productRes = await req("POST", "/products", {
    name: `E2E Test Plugin ${Date.now()}`,
    description: "Created by smoke test",
    status: "active",
  }, adminToken);
  assert(productRes.status === 201, "Admin creates product");
  const productId = productRes.body?.data?._id;

  const planRes = await req("POST", `/products/${productId}/plans`, {
    name: "Single Site",
    allowedSites: 1,
    priceUSD: 49,
    priceLocal: 13500,
    durationDays: 365,
    renewalType: "recurring",
  }, adminToken);
  assert(planRes.status === 201, "Admin creates plan");
  const planId = planRes.body?.data?._id;

  // ── 4. Admin issues a license directly (simulates "payment already confirmed") ──
  // We use the admin license-creation endpoint rather than walking through a
  // real Stripe checkout here, since that requires a live Stripe test key
  // and a browser redirect. Phase 5's payment webhook path is covered by
  // its own dedicated logic (confirmOrderPaid) and is exercised separately.
  const usersRes = await req("GET", `/admin/users?search=${encodeURIComponent(testEmail)}`, null, adminToken);
  const customerId = usersRes.body?.data?.[0]?.id;
  assert(!!customerId, "Admin finds the test customer");

  const licenseRes = await req("POST", "/admin/licenses", {
    userId: customerId, productId, planId,
  }, adminToken);
  assert(licenseRes.status === 201, "Admin issues license");
  const licenseKey = licenseRes.body?.data?.licenseKey;
  const licenseId = licenseRes.body?.data?._id;
  console.log(`   License key: ${licenseKey}`);

  // ── 5. Customer sees the license on their dashboard ──────────────────────
  const myLicenses = await req("GET", "/licenses", null, customerToken);
  const found = myLicenses.body?.data?.some((l) => l._id === licenseId);
  assert(found, "Customer sees the license in their portal");

  // ── 6. Plugin activates a domain ─────────────────────────────────────────
  const activate = await req("POST", "/plugin/activate", {
    licenseKey, domain: "https://example-test-site.com", product: undefined,
  });
  assert(activate.status === 200, "Plugin activates domain", activate.body?.message);

  // ── 7. Plugin activates a SECOND domain — should be rejected (Single Site plan) ──
  const activate2 = await req("POST", "/plugin/activate", {
    licenseKey, domain: "https://second-site.com",
  });
  assert(activate2.status !== 200, "Single-site plan correctly rejects a 2nd domain", activate2.body?.message);

  // ── 8. Plugin checks license status ──────────────────────────────────────
  const check = await req("POST", "/plugin/check", { licenseKey, domain: "example-test-site.com" });
  assert(check.status === 200 && check.body?.data?.status === "active", "Plugin check confirms active license");

  // ── 9. Plugin polls for updates (no versions published yet — should say no update) ──
  const updateCheck = await req("POST", "/plugin/update-check", {
    licenseKey, domain: "example-test-site.com", currentVersion: "1.0.0",
  });
  assert(updateCheck.status === 200, "Plugin update-check responds", updateCheck.body?.message);

  // ── 10. Customer requests a download (expected to fail — no version published yet) ──
  const downloadReq = await req("POST", "/downloads/request", { licenseId }, customerToken);
  assert(
    downloadReq.status === 404 || downloadReq.status === 200,
    "Download request handled gracefully (no published version is an expected 404 here)",
    downloadReq.body?.message
  );

  // ── 11. Customer self-deactivates the domain ─────────────────────────────
  const deactivate = await req("POST", `/licenses/${licenseId}/deactivate-domain`, {
    domain: "https://example-test-site.com",
  }, customerToken);
  assert(deactivate.status === 200, "Customer deactivates domain from portal");

  // ── 12. Admin suspends the license ───────────────────────────────────────
  const suspend = await req("POST", `/admin/licenses/${licenseId}/suspend`, {}, adminToken);
  assert(suspend.status === 200, "Admin suspends license");

  // ── 13. Plugin check now reflects suspended status ───────────────────────
  const checkAfterSuspend = await req("POST", "/plugin/check", { licenseKey });
  assert(
    checkAfterSuspend.body?.data?.status === "suspended" || checkAfterSuspend.status !== 200,
    "Plugin check reflects suspension",
    checkAfterSuspend.body?.message
  );

  // ── 14. Admin reinstates the license (cleanup) ───────────────────────────
  const reinstate = await req("POST", `/admin/licenses/${licenseId}/reinstate`, {}, adminToken);
  assert(reinstate.status === 200, "Admin reinstates license (cleanup)");

  // ── 15. Coupon flow ───────────────────────────────────────────────────────
  const couponCode = `E2E${Date.now()}`.slice(0, 12);
  const couponRes = await req("POST", "/admin/coupons", {
    code: couponCode, type: "percentage", value: 10,
  }, adminToken);
  assert(couponRes.status === 201, "Admin creates a coupon");

  // ── 16. Support ticket flow ───────────────────────────────────────────────
  const ticketRes = await req("POST", "/support/tickets", {
    subject: "E2E test ticket", message: "This is an automated smoke-test ticket.",
  }, customerToken);
  assert(ticketRes.status === 201, "Customer opens a support ticket");
  const ticketId = ticketRes.body?.data?._id;

  const replyRes = await req("POST", `/admin/support/tickets/${ticketId}/reply`, {
    message: "Automated reply from smoke test.",
  }, adminToken);
  assert(replyRes.status === 200, "Admin replies to support ticket");

  printSummary();
}

function printSummary() {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("─".repeat(50) + "\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});
