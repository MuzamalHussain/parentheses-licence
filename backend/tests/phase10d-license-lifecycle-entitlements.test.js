const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase10d_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10d_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const licenseId = "507f1f77bcf86cd799439101";
const userId = "507f1f77bcf86cd799439102";
const newUserId = "507f1f77bcf86cd799439103";
const productId = "507f1f77bcf86cd799439104";
const planId = "507f1f77bcf86cd799439105";
const newPlanId = "507f1f77bcf86cd799439106";
const adminId = "507f1f77bcf86cd799439107";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  const api = {
    populate() { return api; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return api;
}

function makeLicense(overrides = {}) {
  return {
    _id: licenseId,
    licenseKey: "TEST-10D-LIFE",
    userId,
    productId,
    planId,
    status: "active",
    allowedSites: 1,
    activeDomains: [],
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    entitlements: {
      downloads: true,
      updates: true,
      activations: true,
      betaChannel: false,
      prioritySupport: false,
      lifetimeUpdates: false,
      lifetimeSupport: false,
    },
    renewal: { eligible: true, autoRenew: false, gracePeriodDays: 0 },
    renewalHistory: [],
    upgradeHistory: [],
    transferHistory: [],
    async save() { this.saved = true; return this; },
    toObject() { return { ...this }; },
    ...overrides,
  };
}

function loadService(store = {}) {
  store.auditLogs = store.auditLogs || [];
  store.activations = store.activations || [];
  store.plan = store.plan || { _id: newPlanId, productId, allowedSites: 5 };
  store.user = store.user || { _id: newUserId };

  for (const relativePath of [
    "src/services/licenseLifecycleService.js",
    "src/models/License.js",
    "src/models/LicenseActivation.js",
    "src/models/Plan.js",
    "src/models/User.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  const mocks = [
    ["src/models/License.js", {}],
    ["src/models/LicenseActivation.js", {
      async create(payload) { store.activations.push(payload); return payload; },
      async insertMany(payloads) { store.activations.push(...payloads); return payloads; },
    }],
    ["src/models/Plan.js", {
      findOne(filter) {
        return query(filter._id === newPlanId && filter.productId === productId ? store.plan : null);
      },
    }],
    ["src/models/User.js", {
      findById(id) {
        return query(id === newUserId ? store.user : null);
      },
    }],
    ["src/utils/auditLog.js", {
      writeAuditLog: async (entry) => store.auditLogs.push(entry),
    }],
  ];

  for (const [relativePath, mock] of mocks) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/services/licenseLifecycleService.js"));
}

function admin() {
  return { _id: adminId, role: "admin" };
}

function req() {
  return { ip: "198.51.100.10" };
}

async function testActivationAndDeactivation() {
  const store = {};
  const service = loadService(store);
  const license = makeLicense();

  await service.activateDomain({ license, domain: "Example.com", actor: admin(), req: req(), manual: true });
  assert.strictEqual(license.activeDomains[0].domain, "example.com");
  assert.strictEqual(store.activations[0].action, "manual_activate");

  await service.deactivateDomain({ license, domain: "example.com", actor: admin(), req: req(), force: true });
  assert.strictEqual(license.activeDomains.length, 0);
  assert.strictEqual(store.activations[1].action, "force_deactivate");
}

async function testSuspensionRevocationAndPermissions() {
  const service = loadService();
  const license = makeLicense();
  await service.transitionLicense({ license, action: "suspend", actor: admin(), req: req() });
  assert.strictEqual(license.status, "suspended");
  assert.strictEqual(service.entitlementSummary(license).canDownload, false);

  await service.transitionLicense({ license, action: "revoke", actor: admin(), req: req() });
  assert.strictEqual(license.status, "revoked");
  await assert.rejects(
    () => service.transitionLicense({ license, action: "activate", actor: admin(), req: req() }),
    /revoked/
  );
}

async function testRenewalAndExpiration() {
  const service = loadService();
  const license = makeLicense({ status: "expired", expiresAt: new Date(Date.now() - 10_000) });
  assert.strictEqual(service.effectiveStatus(license), "expired");

  await service.renewLicense({ license, actor: admin(), req: req(), durationDays: 30, note: "manual renewal" });
  assert.strictEqual(license.status, "active");
  assert.strictEqual(license.renewalHistory.length, 1);
  assert.ok(license.expiresAt > new Date());
}

async function testTransferAndUpgrade() {
  const service = loadService();
  const license = makeLicense();

  await service.transferLicense({ license, toUserId: newUserId, actor: admin(), req: req(), note: "admin transfer" });
  assert.strictEqual(license.userId, newUserId);
  assert.strictEqual(license.transferHistory[0].fromUserId, userId);

  await service.changePlan({ license, toPlanId: newPlanId, actor: admin(), req: req(), changeType: "upgrade" });
  assert.strictEqual(license.planId, newPlanId);
  assert.strictEqual(license.allowedSites, 5);
  assert.strictEqual(license.upgradeHistory[0].changeType, "upgrade");
}

async function testEntitlementsAndLifetimeConversion() {
  const service = loadService();
  const license = makeLicense({ entitlements: { downloads: false, updates: true, activations: true } });
  assert.strictEqual(service.entitlementSummary(license).canDownload, false);

  await service.transitionLicense({ license, action: "convert_lifetime", actor: admin(), req: req() });
  assert.strictEqual(license.status, "lifetime");
  assert.strictEqual(license.expiresAt, null);
  assert.strictEqual(service.entitlementSummary(license).entitlements.lifetimeUpdates, true);
}

function testRoutePermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testActivationAndDeactivation,
    testSuspensionRevocationAndPermissions,
    testRenewalAndExpiration,
    testTransferAndUpgrade,
    testEntitlementsAndLifetimeConversion,
    testRoutePermissions,
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
