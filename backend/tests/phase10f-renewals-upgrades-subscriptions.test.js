const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase10f_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10f_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const licenseId = "507f1f77bcf86cd799439301";
const productId = "507f1f77bcf86cd799439302";
const planId = "507f1f77bcf86cd799439303";
const upgradePlanId = "507f1f77bcf86cd799439304";
const downgradePlanId = "507f1f77bcf86cd799439305";
const adminId = "507f1f77bcf86cd799439306";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
}

function makeLicense(overrides = {}) {
  return {
    _id: licenseId,
    licenseKey: "TEST-10F-RENEW",
    userId: "user_10f",
    productId,
    planId,
    status: "active",
    allowedSites: 1,
    activeDomains: [],
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    entitlements: { downloads: true, updates: true, activations: true },
    renewal: { eligible: true, autoRenew: false, gracePeriodDays: 7, renewalWindowDays: 30 },
    renewalHistory: [],
    upgradeHistory: [],
    transferHistory: [],
    subscription: { status: "manual", autoRenew: false, manualRenewal: true },
    subscriptionHistory: [],
    async save() { this.saved = true; return this; },
    toObject() { return { ...this }; },
    ...overrides,
  };
}

function loadService(store = {}) {
  store.auditLogs = store.auditLogs || [];
  store.plans = store.plans || {
    [planId]: { _id: planId, productId, allowedSites: 1, planType: "single_site", upgradeRank: 1 },
    [upgradePlanId]: { _id: upgradePlanId, productId, allowedSites: 10, planType: "10_sites", upgradeRank: 10 },
    [downgradePlanId]: { _id: downgradePlanId, productId, allowedSites: 1, planType: "single_site", upgradeRank: 1 },
  };

  for (const relativePath of [
    "src/services/licenseLifecycleService.js",
    "src/models/License.js",
    "src/models/LicenseActivation.js",
    "src/models/Plan.js",
    "src/models/User.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  for (const [relativePath, mock] of [
    ["src/models/License.js", {}],
    ["src/models/LicenseActivation.js", { create: async () => ({}), insertMany: async () => [] }],
    ["src/models/Plan.js", {
      findOne(filter) {
        const plan = store.plans[filter._id];
        return query(plan && plan.productId === filter.productId && filter.isActive === true ? plan : null);
      },
      findById(id) {
        return query(store.plans[id] || null);
      },
    }],
    ["src/models/User.js", { findById: () => query({ _id: "user" }) }],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditLogs.push(entry) }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/services/licenseLifecycleService.js"));
}

const actor = () => ({ _id: adminId, role: "admin" });
const req = () => ({ ip: "203.0.113.30" });

async function testManualRenewalAndDuplicatePrevention() {
  const service = loadService();
  const license = makeLicense();
  const newExpiresAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  await service.renewLicense({ license, actor: actor(), req: req(), expiresAt: newExpiresAt, reason: "admin_manual", note: "renewed" });
  assert.strictEqual(license.renewalHistory.length, 1);
  assert.strictEqual(license.renewalHistory[0].reason, "admin_manual");
  assert.strictEqual(license.subscription.status, "manual");
  await assert.rejects(
    () => service.renewLicense({ license, actor: actor(), req: req(), expiresAt: newExpiresAt, allowEarly: true }),
    /Duplicate renewal/
  );
}

async function testGracePeriodAllowsDownloadsAndUpdates() {
  const service = loadService();
  const license = makeLicense({ expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
  const summary = service.entitlementSummary(license);
  assert.strictEqual(summary.inGracePeriod, true);
  assert.strictEqual(summary.canDownload, true);
  assert.strictEqual(summary.canUpdate, true);
}

async function testRenewalWindowValidation() {
  const service = loadService();
  const license = makeLicense({ expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000) });
  await assert.rejects(
    () => service.renewLicense({ license, actor: actor(), req: req(), durationDays: 30 }),
    /renewal window/
  );
}

async function testPlanUpgradeAndDowngradeValidation() {
  const service = loadService();
  const license = makeLicense();
  await service.changePlan({ license, toPlanId: upgradePlanId, actor: actor(), req: req(), changeType: "upgrade", reason: "more_sites" });
  assert.strictEqual(license.allowedSites, 10);
  assert.strictEqual(license.licenseType, "10_sites");
  assert.strictEqual(license.upgradeHistory[0].reason, "more_sites");

  await service.changePlan({ license, toPlanId: downgradePlanId, actor: actor(), req: req(), changeType: "downgrade" });
  assert.strictEqual(license.allowedSites, 1);
}

async function testInvalidUpgradeAndDuplicatePlanRejected() {
  const service = loadService();
  const license = makeLicense();
  await assert.rejects(
    () => service.changePlan({ license, toPlanId: downgradePlanId, actor: actor(), req: req(), changeType: "upgrade" }),
    /already on this plan|not an upgrade/
  );
}

async function testSubscriptionStates() {
  const service = loadService();
  const license = makeLicense({ subscription: { status: "active", autoRenew: true, manualRenewal: false }, renewal: { eligible: true, autoRenew: true, gracePeriodDays: 7, renewalWindowDays: 30 } });
  await service.transitionSubscription({ license, action: "pause", actor: actor(), req: req(), reason: "customer_request" });
  assert.strictEqual(license.subscription.status, "paused");
  await service.transitionSubscription({ license, action: "resume", actor: actor(), req: req() });
  assert.strictEqual(license.subscription.status, "active");
  await service.transitionSubscription({ license, action: "cancel", actor: actor(), req: req() });
  assert.strictEqual(license.subscription.status, "cancelled");
  assert.strictEqual(license.subscription.autoRenew, false);
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testManualRenewalAndDuplicatePrevention,
    testGracePeriodAllowsDownloadsAndUpdates,
    testRenewalWindowValidation,
    testPlanUpgradeAndDowngradeValidation,
    testInvalidUpgradeAndDuplicatePlanRejected,
    testSubscriptionStates,
    testPermissions,
  ];
  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
