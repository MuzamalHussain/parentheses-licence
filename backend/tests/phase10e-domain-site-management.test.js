const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase10e_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10e_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const licenseId = "507f1f77bcf86cd799439201";
const userId = "507f1f77bcf86cd799439202";
const productId = "507f1f77bcf86cd799439203";
const adminId = "507f1f77bcf86cd799439204";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function makeLicense(overrides = {}) {
  return {
    _id: licenseId,
    licenseKey: "TEST-10E-SITE",
    userId,
    productId,
    status: "active",
    activeDomains: [],
    ...overrides,
  };
}

function makeHarness() {
  const store = {
    sites: [],
    activations: [],
    auditLogs: [],
    license: makeLicense(),
  };

  const LicenseMock = {
    async findOneAndUpdate(filter, update) {
      if (filter._id !== licenseId) return null;
      if (update.$push?.activeDomains) store.license.activeDomains.push(update.$push.activeDomains);
      return store.license;
    },
    async findByIdAndUpdate(id, update) {
      if (id !== licenseId) return null;
      if (update.$pull?.activeDomains) {
        store.license.activeDomains = store.license.activeDomains.filter((entry) => entry.domain !== update.$pull.activeDomains.domain);
      }
      return store.license;
    },
  };

  const LicenseSiteMock = {
    findOne(filter) {
      return query(store.sites.find((site) => site.licenseId === filter.licenseId && site.domain === filter.domain) || null);
    },
    async findOneAndUpdate(filter, update) {
      let site = store.sites.find((item) => item.licenseId === filter.licenseId && item.domain === filter.domain);
      if (!site) {
        site = {
          _id: `site-${store.sites.length + 1}`,
          licenseId: update.$setOnInsert.licenseId,
          domain: update.$setOnInsert.domain,
          activatedAt: update.$setOnInsert.activatedAt,
          async save() { return this; },
        };
        store.sites.push(site);
      }
      Object.assign(site, update.$set);
      return site;
    },
  };

  const LicenseActivationMock = {
    async create(payload) { store.activations.push(payload); return payload; },
  };

  for (const relativePath of [
    "src/services/siteActivationService.js",
    "src/models/License.js",
    "src/models/LicenseSite.js",
    "src/models/LicenseActivation.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  for (const [relativePath, mock] of [
    ["src/models/License.js", LicenseMock],
    ["src/models/LicenseSite.js", LicenseSiteMock],
    ["src/models/LicenseActivation.js", LicenseActivationMock],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditLogs.push(entry) }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return { store, service: require(path.join(root, "src/services/siteActivationService.js")) };
}

function req() {
  return { ip: "203.0.113.20" };
}

async function testActivationCreatesSiteAndNormalizesDomain() {
  const { store, service } = makeHarness();
  const site = await service.upsertSiteActivation({
    license: store.license,
    input: {
      siteName: "Main Store",
      siteUrl: "https://www.Example.com/",
      pluginVersion: "2.0.0",
      wpVersion: "6.6",
      phpVersion: "8.2",
    },
    req: req(),
  });
  assert.strictEqual(site.domain, "example.com");
  assert.strictEqual(site.siteName, "Main Store");
  assert.strictEqual(site.environment, "production");
  assert.strictEqual(store.license.activeDomains[0].domain, "example.com");
  assert.strictEqual(store.activations[0].action, "activate");
}

async function testDuplicateDetectionUpdatesExistingSite() {
  const { store, service } = makeHarness();
  await service.upsertSiteActivation({ license: store.license, input: { domain: "example.com", pluginVersion: "1.0.0" }, req: req() });
  await service.upsertSiteActivation({ license: store.license, input: { domain: "https://www.example.com", pluginVersion: "1.1.0" }, req: req() });
  assert.strictEqual(store.sites.length, 1);
  assert.strictEqual(store.sites[0].pluginVersion, "1.1.0");
}

function testEnvironmentDetection() {
  const { service } = makeHarness();
  assert.strictEqual(service.detectEnvironment({ domain: "localhost" }), "localhost");
  assert.strictEqual(service.detectEnvironment({ domain: "staging.example.com" }), "staging");
  assert.strictEqual(service.detectEnvironment({ domain: "example.com" }), "production");
}

async function testHeartbeatAndReplayProtection() {
  const { store, service } = makeHarness();
  await service.upsertSiteActivation({ license: store.license, input: { domain: "example.com" }, req: req() });
  const site = await service.heartbeat({ license: store.license, input: { domain: "example.com", heartbeatNonce: "nonce-1", pluginVersion: "2.0.0" }, req: req() });
  assert.ok(site.lastHeartbeatAt);
  assert.strictEqual(site.pluginVersion, "2.0.0");
  await assert.rejects(
    () => service.heartbeat({ license: store.license, input: { domain: "example.com", heartbeatNonce: "nonce-1" }, req: req() }),
    /Duplicate heartbeat/
  );
}

async function testDeactivationAndAdminActions() {
  const { store, service } = makeHarness();
  await service.upsertSiteActivation({ license: store.license, input: { domain: "example.com" }, req: req() });
  await service.renameSite({ license: store.license, domain: "example.com", siteName: "Renamed", actor: { _id: adminId }, actorRole: "admin", req: req() });
  assert.strictEqual(store.sites[0].siteName, "Renamed");
  await service.adminSiteAction({ license: store.license, domain: "example.com", action: "blacklist", actor: { _id: adminId }, req: req() });
  assert.strictEqual(store.sites[0].blacklisted, true);
  assert.strictEqual(store.sites[0].status, "revoked");
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "customer" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testActivationCreatesSiteAndNormalizesDomain,
    testDuplicateDetectionUpdatesExistingSite,
    testEnvironmentDetection,
    testHeartbeatAndReplayProtection,
    testDeactivationAndAdminActions,
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
