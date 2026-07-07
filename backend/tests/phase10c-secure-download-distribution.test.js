const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase10c_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10c_test_refresh_secret_with_enough_entropy";
process.env.LICENSE_DOWNLOAD_TOKEN_TTL_MS = "600000";
process.env.LICENSE_DOWNLOAD_SINGLE_USE = "true";

const root = path.resolve(__dirname, "..");
const userId = "507f1f77bcf86cd799439001";
const licenseId = "507f1f77bcf86cd799439002";
const productId = "507f1f77bcf86cd799439003";
const versionId = "507f1f77bcf86cd799439004";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  const api = {
    populate() { return api; },
    select() { return api; },
    sort() { return api; },
    lean() { return Promise.resolve(value); },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return api;
}

function createHarness(overrides = {}) {
  const store = {
    downloads: [],
    auditLogs: [],
    product: {
      _id: productId,
      name: "Parentheses",
      slug: "parentheses",
      status: "active",
      defaultReleaseChannel: "stable",
      betaEnabled: false,
      alphaEnabled: false,
      downloadEnabled: true,
      ...overrides.product,
    },
    license: null,
    version: {
      _id: versionId,
      productId,
      versionNumber: "2.1.0",
      releaseChannel: overrides.releaseChannel || "stable",
      isPublished: true,
      zipFilePath: "",
      originalFileName: "parentheses.zip",
      fileSizeBytes: 12,
      checksum: "a".repeat(64),
      checksumMd5: "b".repeat(32),
      changelog: "Secure release",
      releasedAt: new Date("2026-01-01T00:00:00Z"),
      releaseDate: new Date("2026-01-01T00:00:00Z"),
      assets: [],
      ...overrides.version,
    },
  };
  store.license = {
    _id: licenseId,
    userId,
    productId: store.product,
    status: overrides.licenseStatus || "active",
    expiresAt: overrides.expiresAt || null,
    allowedReleaseChannels: overrides.allowedReleaseChannels || [],
    downloadLimits: overrides.downloadLimits || { perLicense: 0, perVersion: 0, perDay: 0 },
  };

  const LicenseMock = {
    findOne(filter) {
      const found = filter._id === licenseId && filter.userId === userId ? store.license : null;
      return query(found);
    },
    findById() {
      return query(store.license);
    },
  };

  const PluginVersionMock = {
    findOne(filter) {
      if (filter._id && filter._id !== versionId) return query(null);
      if (filter.productId?.toString?.() !== productId && filter.productId !== productId) return query(null);
      if (filter.releaseChannel?.$in && !filter.releaseChannel.$in.includes(store.version.releaseChannel)) return query(null);
      return query(store.version);
    },
    findById() {
      return query(store.version);
    },
  };

  const DownloadMock = {
    async create(payload) {
      store.downloads.push({ _id: `download-${store.downloads.length + 1}`, ...payload });
      return store.downloads[store.downloads.length - 1];
    },
    async countDocuments(filter) {
      return store.downloads.filter((item) => {
        if (filter.licenseId && item.licenseId !== filter.licenseId) return false;
        if (filter.pluginVersionId && item.pluginVersionId !== filter.pluginVersionId) return false;
        if (filter.status && item.status !== filter.status) return false;
        return true;
      }).length;
    },
    findOne() {
      return query(store.downloads[0] || null);
    },
    async findOneAndUpdate(filter, update) {
      const item = store.downloads.find((download) => download._id === filter._id);
      if (!item) return null;
      Object.assign(item, update.$set);
      return item;
    },
  };

  return { store, mocks: { LicenseMock, PluginVersionMock, DownloadMock } };
}

function installMocks(harness) {
  for (const [relativePath, mock] of [
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/PluginVersion.js", harness.mocks.PluginVersionMock],
    ["src/models/Download.js", harness.mocks.DownloadMock],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => harness.store.auditLogs.push(entry) }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }
}

function loadService(harness) {
  for (const relativePath of [
    "src/services/downloadDistributionService.js",
    "src/models/License.js",
    "src/models/PluginVersion.js",
    "src/models/Download.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);
  installMocks(harness);
  return require(path.join(root, "src/services/downloadDistributionService.js"));
}

function req() {
  return {
    ip: "203.0.113.10",
    headers: { "user-agent": "Mozilla/5.0 Windows Chrome/120" },
  };
}

async function testSignedUrlAndExpiredUrlValidation() {
  const service = loadService(createHarness());
  const valid = service.createSignedToken(new Date(Date.now() + 10000));
  assert.strictEqual(service.verifySignedToken(valid).valid, true);

  const tampered = `${valid.slice(0, -2)}xx`;
  assert.strictEqual(service.verifySignedToken(tampered).valid, false);

  const expired = service.createSignedToken(new Date(Date.now() - 1000));
  assert.deepStrictEqual(service.verifySignedToken(expired), { valid: false, reason: "expired" });
}

async function testLicenseValidationDownloadAuthorizationAndHistoryLogging() {
  const harness = createHarness();
  const service = loadService(harness);
  const result = await service.authorizeCustomerDownload({
    user: { _id: userId, email: "customer@example.test" },
    licenseId,
    pluginVersionId: versionId,
    req: req(),
  });

  assert.ok(result.downloadUrl.startsWith("/api/v1/downloads/file/"));
  assert.strictEqual(harness.store.downloads[0].status, "authorized");
  assert.strictEqual(harness.store.downloads[0].releaseChannel, "stable");
  assert.strictEqual(harness.store.downloads[0].browser, "Chrome");
  assert.strictEqual(harness.store.auditLogs.some((entry) => entry.action === "download.authorized"), true);
}

async function testReleaseChannelResolutionRejectsIneligibleChannel() {
  const harness = createHarness({ releaseChannel: "beta" });
  const service = loadService(harness);
  await assert.rejects(
    () => service.authorizeCustomerDownload({
      user: { _id: userId },
      licenseId,
      pluginVersionId: versionId,
      req: req(),
    }),
    /not eligible/
  );
  assert.strictEqual(harness.store.downloads[0].status, "denied");
}

async function testDownloadLimitsRejectAfterConfiguredLimit() {
  const harness = createHarness({ downloadLimits: { perLicense: 1, perVersion: 0, perDay: 0 } });
  harness.store.downloads.push({ licenseId, pluginVersionId: versionId, status: "completed" });
  const service = loadService(harness);
  await assert.rejects(
    () => service.authorizeCustomerDownload({ user: { _id: userId }, licenseId, pluginVersionId: versionId, req: req() }),
    /limit reached/
  );
}

async function testStorageAdapterMetadata() {
  clearModule("src/services/storageService.js");
  const { LocalStorageAdapter, S3CompatibleStorageAdapter } = require(path.join(root, "src/services/storageService.js"));
  const filePath = path.join(os.tmpdir(), `phase10c-${Date.now()}.zip`);
  fs.writeFileSync(filePath, "zip-content");

  const adapter = new LocalStorageAdapter();
  const stat = await adapter.stat({ path: filePath, fileName: "plugin.zip" });
  assert.strictEqual(stat.exists, true);
  assert.strictEqual(stat.size, 11);
  assert.strictEqual(stat.contentType, "application/zip");
  assert.strictEqual((await new S3CompatibleStorageAdapter().stat({})).unsupported, true);
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin", "support")({ user: { role: "customer" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testSignedUrlAndExpiredUrlValidation,
    testLicenseValidationDownloadAuthorizationAndHistoryLogging,
    testReleaseChannelResolutionRejectsIneligibleChannel,
    testDownloadLimitsRejectAfterConfiguredLimit,
    testStorageAdapterMetadata,
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
