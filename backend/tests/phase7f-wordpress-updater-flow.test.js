const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Writable } = require("stream");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase7f_test_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase7f_test_refresh_secret";

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

function createHarness(overrides = {}) {
  const zipPath = overrides.zipPath || path.join(os.tmpdir(), `phase7f-${Date.now()}-${Math.random()}.zip`);
  if (!overrides.skipZipWrite) fs.writeFileSync(zipPath, "PK test zip content");

  const store = {
    license: {
      _id: "lic_1",
      userId: "user_1",
      licenseKey: "TEST-KEY1-KEY2-KEY3",
      status: overrides.licenseStatus || "active",
      expiresAt: overrides.expiresAt || null,
      productId: { _id: "prod_1", name: "Parentheses", slug: "parentheses", status: "active" },
      activeDomains: [{ domain: "example.com", activatedAt: new Date().toISOString() }],
    },
    version: {
      _id: "ver_1",
      productId: overrides.versionProductId || "prod_1",
      versionNumber: "1.2.0",
      changelog: "Security and updater improvements.",
      zipFilePath: zipPath,
      originalFileName: "parentheses.zip",
      checksum: "abc123",
      isPublished: true,
      minWpVersion: "6.0",
      minPhpVersion: "8.0",
      releasedAt: new Date().toISOString(),
    },
    downloads: [],
  };

  if (overrides.notEntitled) store.license.productId.slug = "other-plugin";
  if (overrides.domainNotActivated) store.license.activeDomains = [{ domain: "other.com", activatedAt: new Date().toISOString() }];
  if (overrides.noLicense) store.license = null;

  const LicenseMock = {
    findOne(filter) {
      if (!store.license || filter.licenseKey !== store.license.licenseKey) return query(null);
      return query(clone(store.license));
    },
    findById(id) {
      if (!store.license || id !== store.license._id) return query(null);
      return query(clone(store.license));
    },
  };

  const PluginVersionMock = {
    find(filter) {
      if (filter.productId !== "prod_1" || filter.isPublished !== true) return query([]);
      return query([clone(store.version)]);
    },
    findById(id) {
      if (id !== store.version._id) return query(null);
      return query(clone(store.version));
    },
  };

  const DownloadMock = {
    async create(doc) {
      store.downloads.push({ usedAt: null, ...doc, _id: `dl_${store.downloads.length + 1}`, async save() { Object.assign(store.downloads.find((d) => d._id === this._id), this); } });
      return store.downloads[store.downloads.length - 1];
    },
    findOne(filter) {
      const found = store.downloads.find((download) =>
        download.tokenHash === filter.tokenHash &&
        (!filter.purpose || download.purpose === filter.purpose)
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

  const auditLogMock = {
    writeAuditLog: async () => {},
  };

  return { store, mocks: { LicenseMock, PluginVersionMock, DownloadMock, auditLogMock }, zipPath };
}

function loadController(harness) {
  clearModule("src/controllers/wpUpdaterController.js");
  for (const [relativePath, exports] of [
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/PluginVersion.js", harness.mocks.PluginVersionMock],
    ["src/models/Download.js", harness.mocks.DownloadMock],
    ["src/utils/auditLog.js", harness.mocks.auditLogMock],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }
  return require(path.join(root, "src/controllers/wpUpdaterController.js"));
}

function createReq(body = {}, token = "") {
  return {
    body,
    params: { token },
    ip: "127.0.0.1",
    protocol: "https",
    get: (header) => (header.toLowerCase() === "host" ? "licensing.example.test" : ""),
  };
}

function createJsonRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  };
}

function createStreamRes() {
  const chunks = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  writable.statusCode = 200;
  writable.body = null;
  writable.headers = {};
  writable.status = function status(code) { this.statusCode = code; return this; };
  writable.json = function json(payload) { this.body = payload; this.emit("finish"); return this; };
  writable.setHeader = function setHeader(name, value) { this.headers[name.toLowerCase()] = value; };
  writable.collected = () => Buffer.concat(chunks).toString("utf8");
  return writable;
}

async function callJson(handler, req) {
  const res = createJsonRes();
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  if (nextError) throw nextError;
  return res;
}

async function callStream(handler, req) {
  const res = createStreamRes();
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  if (nextError) throw nextError;
  if (!res.body) await new Promise((resolve) => res.once("finish", resolve));
  return res;
}

const updateBody = (overrides = {}) => ({
  license_key: "TEST-KEY1-KEY2-KEY3",
  site_url: "https://example.com/wp-admin",
  plugin_slug: "parentheses",
  current_version: "1.0.0",
  ...overrides,
});

async function testValidLicenseOlderVersionReturnsUpdateMetadata() {
  const harness = createHarness();
  const controller = loadController(harness);
  const res = await callJson(controller.check, createReq(updateBody()));

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.update_available, true);
  assert.strictEqual(res.body.new_version, "1.2.0");
  assert.ok(res.body.package.startsWith("https://licensing.example.test/api/wp/updater/download/"));
  assert.ok(!res.body.package.includes(harness.zipPath));
  assert.strictEqual(harness.store.downloads.length, 1);
}

async function testValidLicenseCurrentVersionReturnsNoUpdate() {
  const harness = createHarness();
  const controller = loadController(harness);
  const res = await callJson(controller.check, createReq(updateBody({ current_version: "1.2.0" })));

  assert.strictEqual(res.body.update_available, false);
  assert.strictEqual(harness.store.downloads.length, 0);
}

async function testInvalidLicenseRejected() {
  const harness = createHarness({ noLicense: true });
  const controller = loadController(harness);
  const res = await callJson(controller.check, createReq(updateBody()));

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.code, "license_invalid_or_not_entitled");
}

async function testExpiredSuspendedLicenseRejected() {
  let harness = createHarness({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  let controller = loadController(harness);
  let res = await callJson(controller.check, createReq(updateBody()));
  assert.strictEqual(res.statusCode, 403);

  harness = createHarness({ licenseStatus: "suspended" });
  controller = loadController(harness);
  res = await callJson(controller.check, createReq(updateBody()));
  assert.strictEqual(res.statusCode, 403);
}

async function testLicenseNotEntitledRejected() {
  const harness = createHarness({ notEntitled: true });
  const controller = loadController(harness);
  const res = await callJson(controller.check, createReq(updateBody()));

  assert.strictEqual(res.statusCode, 403);
}

async function testSiteDomainNotActivatedRejected() {
  const harness = createHarness({ domainNotActivated: true });
  const controller = loadController(harness);
  const res = await callJson(controller.check, createReq(updateBody()));

  assert.strictEqual(res.statusCode, 403);
}

async function testSignedDownloadUrlExpires() {
  const harness = createHarness();
  const controller = loadController(harness);
  const { createUpdaterToken } = require(path.join(root, "src/utils/updaterToken.js"));
  const token = createUpdaterToken({ purpose: "wordpress_update", expiresAt: new Date(Date.now() - 1000) });
  const { hashToken } = require(path.join(root, "src/utils/downloadToken.js"));
  await harness.mocks.DownloadMock.create({
    userId: "user_1",
    licenseId: "lic_1",
    pluginVersionId: "ver_1",
    tokenHash: hashToken(token),
    purpose: "wordpress_update",
    domain: "example.com",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const res = await callJson(controller.download, createReq({}, token));
  assert.strictEqual(res.statusCode, 403);
}

async function testTamperedTokenRejected() {
  const harness = createHarness();
  const controller = loadController(harness);
  const check = await callJson(controller.check, createReq(updateBody()));
  const token = check.body.package.split("/").pop();
  const tampered = `${token.slice(0, -1)}x`;
  const res = await callJson(controller.download, createReq({}, tampered));

  assert.strictEqual(res.statusCode, 403);
}

async function testTokenCannotDownloadAnotherProduct() {
  const harness = createHarness({ versionProductId: "prod_2" });
  const controller = loadController(harness);
  const check = await callJson(controller.check, createReq(updateBody()));
  const token = check.body.package.split("/").pop();
  const res = await callJson(controller.download, createReq({}, token));

  assert.strictEqual(res.statusCode, 403);
}

async function testZipStreamsForValidToken() {
  const harness = createHarness();
  const controller = loadController(harness);
  const check = await callJson(controller.check, createReq(updateBody()));
  const token = check.body.package.split("/").pop();
  const res = await callStream(controller.download, createReq({}, token));

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["content-type"], "application/zip");
  assert.strictEqual(res.collected(), "PK test zip content");
  assert.ok(harness.store.downloads[0].usedAt);
}

async function testPathTraversalAttemptRejected() {
  const harness = createHarness({ zipPath: "..\\secret.zip", skipZipWrite: true });
  const controller = loadController(harness);
  const check = await callJson(controller.check, createReq(updateBody()));
  const token = check.body.package.split("/").pop();
  const res = await callJson(controller.download, createReq({}, token));

  assert.strictEqual(res.statusCode, 404);
}

async function run() {
  const tests = [
    testValidLicenseOlderVersionReturnsUpdateMetadata,
    testValidLicenseCurrentVersionReturnsNoUpdate,
    testInvalidLicenseRejected,
    testExpiredSuspendedLicenseRejected,
    testLicenseNotEntitledRejected,
    testSiteDomainNotActivatedRejected,
    testSignedDownloadUrlExpires,
    testTamperedTokenRejected,
    testTokenCannotDownloadAnotherProduct,
    testZipStreamsForValidToken,
    testPathTraversalAttemptRejected,
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
