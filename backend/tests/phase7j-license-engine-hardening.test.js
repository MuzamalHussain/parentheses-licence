const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function clone(value) {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value));
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  };
}

async function call(handler, req) {
  const res = createRes();
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  if (nextError) throw nextError;
  return res;
}

async function testLicenseKeyGenerationRetriesCollisionsAndSupportsChecksum() {
  const { generateUniqueLicenseKey, generateLicenseKey } = require(path.join(root, "src/utils/licenseKey.js"));
  const seen = new Set();
  const LicenseModel = {
    exists({ licenseKey }) {
      if (!seen.size) {
        seen.add(licenseKey);
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    },
  };

  const key = await generateUniqueLicenseKey(LicenseModel, 5);
  assert.match(key, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);

  const withChecksum = generateLicenseKey({ segments: 2, segmentLength: 3, includeChecksum: true });
  assert.match(withChecksum, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{2}$/);
}

async function testDomainPolicyRejectsWildcardsAndProductionLocalhost() {
  const { isValidDomain, domainPolicyViolation } = require(path.join(root, "src/utils/domain.js"));

  assert.strictEqual(isValidDomain("*.example.com"), false);
  assert.strictEqual(domainPolicyViolation("localhost", { allowLocalhost: false }), "localhost_not_allowed");
  assert.strictEqual(domainPolicyViolation("192.168.1.10", { allowPrivateHosts: false }), "private_host_not_allowed");
  assert.strictEqual(domainPolicyViolation("staging.example.com", { allowStagingDomains: false }), "staging_not_allowed");
}

function createPluginHarness() {
  const store = {
    license: {
      _id: "lic_1",
      userId: { _id: "user_1", status: "active" },
      licenseKey: "TEST-KEY1-KEY2-KEY3",
      status: "active",
      allowedSites: 1,
      expiresAt: null,
      productId: { _id: "prod_1", name: "Parentheses", slug: "parentheses", status: "active" },
      planId: { _id: "plan_1", name: "Solo", allowedSites: 1 },
      activeDomains: [{ domain: "example.com", activatedAt: new Date().toISOString() }],
    },
    auditEvents: [],
  };

  const LicenseMock = {
    findOne(filter) {
      if (filter.licenseKey !== store.license.licenseKey) return query(null);
      return query(clone(store.license));
    },
    findById(id) {
      if (id !== store.license._id) return query(null);
      return query(clone(store.license));
    },
  };

  const PluginVersionMock = {
    findOne() {
      return query(null);
    },
  };

  const auditLogMock = {
    writeAuditLog: async (entry) => {
      store.auditEvents.push(entry);
    },
  };

  clearModule("src/controllers/pluginActivationController.js");
  for (const [relativePath, exports] of [
    ["src/models/License.js", LicenseMock],
    ["src/models/PluginVersion.js", PluginVersionMock],
    ["src/models/LicenseActivation.js", { create: async () => {}, insertMany: async () => {} }],
    ["src/utils/auditLog.js", auditLogMock],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  return { store, controller: require(path.join(root, "src/controllers/pluginActivationController.js")) };
}

async function testValidationFailureIsGenericAndAudited() {
  const { store, controller } = createPluginHarness();
  const res = await call(controller.check, {
    body: { licenseKey: "TEST-KEY1-KEY2-KEY3", domain: "other.example.com", product: "parentheses" },
    ip: "127.0.0.1",
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.valid, false);
  assert.strictEqual(res.body.licenseKey, undefined);
  assert.strictEqual(store.auditEvents[0].action, "license.validation_failed");
  assert.strictEqual(store.auditEvents[0].metadata.reason, "domain_not_activated");
}

async function testUpdateCheckRequiresActivatedDomain() {
  const { store, controller } = createPluginHarness();
  const res = await call(controller.updateCheck, {
    body: {
      licenseKey: store.license.licenseKey,
      domain: "other.example.com",
      product: "parentheses",
      currentVersion: "1.0.0",
    },
    ip: "127.0.0.1",
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.updateAvailable, false);
}

function createDownloadHarness() {
  const zipPath = path.join(os.tmpdir(), `phase7j-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(zipPath, "PK phase7j");
  const store = {
    license: {
      _id: "lic_1",
      userId: "user_1",
      status: "active",
      expiresAt: null,
      productId: { _id: "prod_1", slug: "parentheses", status: "active" },
    },
    version: {
      _id: "ver_1",
      productId: "prod_1",
      versionNumber: "1.0.0",
      isPublished: true,
      zipFilePath: zipPath,
      originalFileName: "parentheses.zip",
    },
    downloads: [],
  };

  const LicenseMock = {
    findById(id) {
      if (id !== store.license._id) return query(null);
      return query(clone(store.license));
    },
  };

  const PluginVersionMock = {
    findById(id) {
      if (id !== store.version._id) return query(null);
      return query(clone(store.version));
    },
  };

  const DownloadMock = {
    findOne(filter) {
      const found = store.downloads.find((download) =>
        download.tokenHash === filter.tokenHash &&
        download.purpose === filter.purpose
      );
      return query(found || null);
    },
    findOneAndUpdate(filter, update) {
      const found = store.downloads.find((download) =>
        download._id === filter._id &&
        download.usedAt === null &&
        download.purpose === filter.purpose &&
        download.expiresAt > filter.expiresAt.$gt
      );
      if (!found) return query(null);
      Object.assign(found, update.$set);
      return query(found);
    },
  };

  clearModule("src/controllers/downloadController.js");
  for (const [relativePath, exports] of [
    ["src/models/License.js", LicenseMock],
    ["src/models/PluginVersion.js", PluginVersionMock],
    ["src/models/Download.js", DownloadMock],
    ["src/utils/auditLog.js", { writeAuditLog: async () => {} }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  return { store, controller: require(path.join(root, "src/controllers/downloadController.js")), zipPath };
}

async function testCustomerDownloadReplayRejectedAtomically() {
  const { store, controller } = createDownloadHarness();
  const { hashToken } = require(path.join(root, "src/utils/downloadToken.js"));
  const token = "raw-download-token";
  store.downloads.push({
    _id: "dl_1",
    userId: "user_1",
    licenseId: "lic_1",
    pluginVersionId: "ver_1",
    tokenHash: hashToken(token),
    purpose: "customer_download",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: new Date(),
  });

  const res = await call(controller.serveFile, { params: { token }, ip: "127.0.0.1" });
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.message, /already been used/);
}

async function run() {
  const tests = [
    testLicenseKeyGenerationRetriesCollisionsAndSupportsChecksum,
    testDomainPolicyRejectsWildcardsAndProductionLocalhost,
    testValidationFailureIsGenericAndAudited,
    testUpdateCheckRequiresActivatedDomain,
    testCustomerDownloadReplayRejectedAtomically,
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
