const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT = "true";
process.env.JWT_ACCESS_SECRET = "phase10b_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10b_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const productId = "507f1f77bcf86cd799439031";
const versionId = "507f1f77bcf86cd799439032";
const adminId = "507f1f77bcf86cd799439012";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  let current = Array.isArray(value) ? [...value] : value;
  const api = {
    select() { return api; },
    populate() { return api; },
    sort() { return api; },
    limit() { return api; },
    lean() { return Promise.resolve(current); },
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };
  return api;
}

function createVersion(overrides = {}) {
  return {
    _id: overrides._id || versionId,
    productId,
    versionNumber: overrides.versionNumber || "1.2.3",
    versionName: overrides.versionName || "",
    status: overrides.status || "draft",
    releaseChannel: overrides.releaseChannel || "stable",
    isPublished: overrides.isPublished || false,
    isLatest: overrides.isLatest || false,
    releasedAt: overrides.releasedAt || null,
    releaseDate: overrides.releaseDate || null,
    async save() { return this; },
    async deleteOne() { this.deleted = true; },
  };
}

function matchesFilter(version, filter) {
  if (filter.productId && version.productId !== filter.productId) return false;
  if (filter.status && version.status !== filter.status) return false;
  if (filter.releaseChannel && version.releaseChannel !== filter.releaseChannel) return false;
  if (filter.versionNumber && version.versionNumber !== filter.versionNumber) return false;
  if (filter.isLatest !== undefined && version.isLatest !== filter.isLatest) return false;
  if (filter._id && version._id !== filter._id) return false;
  if (filter.$or) {
    return filter.$or.some((condition) => {
      const [field, pattern] = Object.entries(condition)[0];
      return pattern.test(version[field] || "");
    });
  }
  return true;
}

function createHarness() {
  const store = {
    product: {
      _id: productId,
      slug: "parentheses",
      pluginSlug: "parentheses",
      defaultReleaseChannel: "stable",
      minWpVersion: "6.0",
      minPhpVersion: "8.0",
      testedUpTo: "6.6",
    },
    versions: [
      createVersion({ status: "published", releaseChannel: "beta", isPublished: true, isLatest: true }),
      createVersion({ _id: "507f1f77bcf86cd799439033", versionNumber: "1.0.0", status: "hidden", releaseChannel: "stable" }),
    ],
    createdPayload: null,
    updatedPayload: null,
    updateManyCalls: [],
    auditLogs: [],
  };

  const ProductMock = {
    findById(id) {
      return query(id?.toString() === productId ? store.product : null);
    },
  };

  const PluginVersionMock = {
    find(filter) {
      store.lastFindFilter = filter;
      return query(store.versions.filter((version) => matchesFilter(version, filter)));
    },
    findOne(filter) {
      if (filter.versionNumber && store.duplicateVersion) return query(createVersion({ versionNumber: filter.versionNumber }));
      return query(store.versions.find((version) => matchesFilter(version, filter)) || null);
    },
    async create(payload) {
      store.createdPayload = payload;
      const version = createVersion({ ...payload, _id: versionId });
      store.versions.push(version);
      return version;
    },
    async updateMany(filter, payload) {
      store.updateManyCalls.push({ filter, payload });
      for (const version of store.versions) {
        if (matchesFilter(version, { productId: filter.productId })) Object.assign(version, payload);
      }
    },
    async findOneAndUpdate(filter, payload) {
      store.updatedPayload = payload;
      const version = store.versions.find((item) => matchesFilter(item, filter));
      if (!version) return null;
      Object.assign(version, payload);
      return version;
    },
  };

  const DownloadMock = {
    aggregate: () => Promise.resolve([{ _id: versionId, count: 8 }]),
  };

  return { store, mocks: { ProductMock, PluginVersionMock, DownloadMock } };
}

function installMocks(harness) {
  for (const [relativePath, mock] of [
    ["src/models/Product.js", harness.mocks.ProductMock],
    ["src/models/PluginVersion.js", harness.mocks.PluginVersionMock],
    ["src/models/Download.js", harness.mocks.DownloadMock],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => harness.store.auditLogs.push(entry) }],
    ["src/utils/pluginZipValidator.js", {
      ZipValidationError: class ZipValidationError extends Error {},
      validatePluginZip: () => ({
        rootFolder: "parentheses",
        mainPluginFile: "parentheses/parentheses.php",
        fileCount: 10,
        totalUncompressedBytes: 1000,
        compressionRatio: 1,
      }),
    }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }
}

function loadController(harness) {
  for (const relativePath of [
    "src/controllers/adminVersionController.js",
    "src/models/Product.js",
    "src/models/PluginVersion.js",
    "src/models/Download.js",
    "src/utils/auditLog.js",
    "src/utils/pluginZipValidator.js",
  ]) clearModule(relativePath);
  installMocks(harness);
  return require(path.join(root, "src/controllers/adminVersionController.js"));
}

function createReq({ body = {}, query = {}, params = { productId }, file = null, user = null } = {}) {
  return {
    body,
    query,
    params,
    file,
    user: user || { _id: adminId, role: "admin", email: "admin@example.test" },
    ip: "127.0.0.1",
    id: "phase10b-request",
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req) {
  const res = createRes();
  let error = null;
  await handler(req, res, (err) => { error = err; });
  return { res, error };
}

function tempZip() {
  const filePath = path.join(os.tmpdir(), `phase10b-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(filePath, "PK phase10b");
  return filePath;
}

function runValidation(schema, body) {
  const { validateRequest } = require(path.join(root, "src/validators/schemas.js"));
  const middleware = validateRequest({ body: schema });
  const req = { body, id: "validation-request" };
  const res = createRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

async function testVersionUploadStoresReleaseMetadataAndChecksums() {
  const harness = createHarness();
  const controller = loadController(harness);
  const filePath = tempZip();
  const { res, error } = await call(controller.uploadVersion, createReq({
    body: {
      versionNumber: "2.0.0",
      versionName: "Major Release",
      status: "published",
      releaseChannel: "beta",
      releaseNotes: "Rich release notes",
      newFeatures: "New dashboard",
      minWpVersion: "6.1",
      minPhpVersion: "8.1",
      testedUpTo: "6.7",
    },
    file: { path: filePath, size: 1024, originalname: "parentheses.zip" },
  }));

  assert.ifError(error);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(harness.store.createdPayload.releaseChannel, "beta");
  assert.strictEqual(harness.store.createdPayload.changelogSections.newFeatures, "New dashboard");
  assert.match(harness.store.createdPayload.checksum, /^[a-f0-9]{64}$/);
  assert.match(harness.store.createdPayload.checksumMd5, /^[a-f0-9]{32}$/);
  assert.strictEqual(harness.store.createdPayload.pluginSlug, "parentheses");
  assert.ok(harness.store.updateManyCalls.length >= 1);
  assert.strictEqual(harness.store.auditLogs[0].action, "plugin_version.uploaded");
}

async function testDuplicateVersionRejected() {
  const harness = createHarness();
  harness.store.duplicateVersion = true;
  const controller = loadController(harness);
  const filePath = tempZip();
  const { error } = await call(controller.uploadVersion, createReq({
    body: { versionNumber: "1.2.3" },
    file: { path: filePath, size: 100, originalname: "parentheses.zip" },
  }));

  assert.strictEqual(error.statusCode, 409);
}

async function testVersionFilteringAddsMetadata() {
  const harness = createHarness();
  const controller = loadController(harness);
  const { res, error } = await call(controller.getVersions, createReq({
    query: { status: "published", releaseChannel: "beta", latest: "true", search: "1.2" },
  }));

  assert.ifError(error);
  assert.strictEqual(harness.store.lastFindFilter.status, "published");
  assert.strictEqual(harness.store.lastFindFilter.releaseChannel, "beta");
  assert.strictEqual(harness.store.lastFindFilter.isLatest, true);
  assert.strictEqual(res.body.data[0].downloadCount, 8);
}

async function testUpdateVersionValidationAndPublishTransition() {
  clearModule("src/validators/schemas.js");
  const { updateVersionSchema } = require(path.join(root, "src/validators/schemas.js"));
  const invalid = runValidation(updateVersionSchema, { status: "live" });
  assert.strictEqual(invalid.nextCalled, false);
  assert.strictEqual(invalid.res.statusCode, 422);

  const valid = runValidation(updateVersionSchema, { status: "published", releaseChannel: "release_candidate", bugFixes: "Fixed" });
  assert.strictEqual(valid.nextCalled, true);

  const harness = createHarness();
  const controller = loadController(harness);
  const { error } = await call(controller.updateVersion, createReq({
    params: { productId, id: versionId },
    body: valid.req.body,
  }));

  assert.ifError(error);
  assert.strictEqual(harness.store.updatedPayload.isPublished, true);
  assert.strictEqual(harness.store.updatedPayload.changelogSections.bugFixes, "Fixed");
}

function testAdminPermissionMiddlewareProtectsVersionWrites() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, createRes(), (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

function testZipValidationRejectsInvalidArchive() {
  clearModule("src/utils/pluginZipValidator.js");
  const { validatePluginZip, ZipValidationError } = require(path.join(root, "src/utils/pluginZipValidator.js"));
  const filePath = path.join(os.tmpdir(), `phase10b-invalid-${Date.now()}.zip`);
  fs.writeFileSync(filePath, "not a zip");
  assert.throws(
    () => validatePluginZip(filePath, { expectedSlug: "parentheses", expectedVersion: "1.0.0" }),
    (err) => err instanceof ZipValidationError && err.code === "invalid_zip"
  );
}

async function run() {
  const tests = [
    testVersionUploadStoresReleaseMetadataAndChecksums,
    testDuplicateVersionRejected,
    testVersionFilteringAddsMetadata,
    testUpdateVersionValidationAndPublishTransition,
    testAdminPermissionMiddlewareProtectsVersionWrites,
    testZipValidationRejectsInvalidArchive,
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
