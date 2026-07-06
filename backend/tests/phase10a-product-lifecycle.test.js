const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";

const root = path.resolve(__dirname, "..");
const productId = "507f1f77bcf86cd799439021";
const adminId = "507f1f77bcf86cd799439012";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  let current = Array.isArray(value) ? [...value] : value;
  const api = {
    sort() { return api; },
    skip() { return api; },
    limit() { return api; },
    lean() { return Promise.resolve(current); },
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };
  return api;
}

function matchesFilter(product, filter) {
  if (filter.status?.$in && !filter.status.$in.includes(product.status)) return false;
  if (typeof filter.status === "string" && product.status !== filter.status) return false;
  if (filter.defaultReleaseChannel && product.defaultReleaseChannel !== filter.defaultReleaseChannel) return false;
  if (filter.$or) {
    return filter.$or.some((condition) => {
      const [field, pattern] = Object.entries(condition)[0];
      return pattern.test(product[field] || "");
    });
  }
  return true;
}

function createHarness() {
  const store = {
    products: [
      {
        _id: productId,
        name: "Lifecycle Pro",
        slug: "lifecycle-pro",
        internalProductCode: "LIFE-PRO",
        status: "published",
        defaultReleaseChannel: "stable",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        _id: "507f1f77bcf86cd799439022",
        name: "Archived Tool",
        slug: "archived-tool",
        internalProductCode: "ARCH-TOOL",
        status: "archived",
        defaultReleaseChannel: "beta",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ],
    createdPayload: null,
    updatedPayload: null,
  };

  const ProductMock = {
    find(filter) {
      store.lastFilter = filter;
      return query(store.products.filter((product) => matchesFilter(product, filter)));
    },
    countDocuments(filter) {
      return Promise.resolve(store.products.filter((product) => matchesFilter(product, filter)).length);
    },
    findById(id) {
      return query(store.products.find((product) => product._id === id) || null);
    },
    async create(payload) {
      store.createdPayload = payload;
      return { _id: productId, ...payload };
    },
    async findByIdAndUpdate(id, payload) {
      store.updatedPayload = { id, payload };
      if (id !== productId) return null;
      return { ...store.products[0], ...payload };
    },
  };

  const PlanMock = { find: () => query([]) };
  const PluginVersionMock = {
    aggregate: () => Promise.resolve([{ _id: productId, versionNumber: "1.2.3", isPublished: true }]),
  };
  const LicenseMock = {
    aggregate: () => Promise.resolve([{ _id: productId, count: 4 }]),
  };
  const DownloadMock = {
    aggregate: () => Promise.resolve([{ _id: productId, count: 12 }]),
  };

  return { store, mocks: { ProductMock, PlanMock, PluginVersionMock, LicenseMock, DownloadMock } };
}

function loadProductController(harness) {
  for (const relativePath of [
    "src/controllers/productController.js",
    "src/models/Product.js",
    "src/models/Plan.js",
    "src/models/PluginVersion.js",
    "src/models/License.js",
    "src/models/Download.js",
  ]) clearModule(relativePath);

  for (const [relativePath, mock] of [
    ["src/models/Product.js", harness.mocks.ProductMock],
    ["src/models/Plan.js", harness.mocks.PlanMock],
    ["src/models/PluginVersion.js", harness.mocks.PluginVersionMock],
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/Download.js", harness.mocks.DownloadMock],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/controllers/productController.js"));
}

function createReq({ query = {}, body = {}, params = {}, role = "admin" } = {}) {
  return {
    query,
    body,
    params,
    user: role ? { _id: adminId, role } : null,
    id: "phase10a-request",
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

function runValidation(schema, body) {
  const { validate } = require(path.join(root, "src/validators/schemas.js"));
  const middleware = validate(schema);
  const req = { body, id: "validation-request" };
  const res = createRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

async function testAdminProductListIncludesLifecycleStatsAndSearch() {
  const harness = createHarness();
  const controller = loadProductController(harness);
  const { res, error } = await call(controller.getProducts, createReq({ query: { search: "life", releaseChannel: "stable" } }));

  assert.ifError(error);
  assert.strictEqual(res.body.data.length, 1);
  assert.strictEqual(res.body.data[0].latestVersion.versionNumber, "1.2.3");
  assert.strictEqual(res.body.data[0].activeLicenseCount, 4);
  assert.strictEqual(res.body.data[0].downloadCount, 12);
  assert.strictEqual(harness.store.lastFilter.defaultReleaseChannel, "stable");
  assert.ok(harness.store.lastFilter.$or);
}

async function testPublicProductListOnlyShowsPublishedOrLegacyActive() {
  const harness = createHarness();
  harness.store.products.push({ _id: "active", name: "Legacy", slug: "legacy", status: "active", createdAt: new Date() });
  const controller = loadProductController(harness);
  const { res, error } = await call(controller.getProducts, createReq({ role: null }));

  assert.ifError(error);
  assert.deepStrictEqual(res.body.data.map((product) => product.status).sort(), ["active", "published"]);
}

async function testCreateProductAcceptsLifecycleFields() {
  const harness = createHarness();
  const controller = loadProductController(harness);
  const body = {
    name: "Lifecycle Pro",
    internalProductCode: "life-pro",
    status: "draft",
    price: 49,
    defaultReleaseChannel: "beta",
    pluginSlug: "lifecycle-pro",
    pluginFolder: "lifecycle-pro",
    mainPluginFile: "lifecycle-pro.php",
  };

  const { res, error } = await call(controller.createProduct, createReq({ body }));

  assert.ifError(error);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(harness.store.createdPayload.createdBy, adminId);
  assert.strictEqual(harness.store.createdPayload.defaultReleaseChannel, "beta");
}

async function testUpdateProductRejectsMissingProduct() {
  const harness = createHarness();
  const controller = loadProductController(harness);
  const { error } = await call(controller.updateProduct, createReq({
    params: { id: "507f1f77bcf86cd799439099" },
    body: { status: "archived" },
  }));

  assert.strictEqual(error.statusCode, 404);
}

async function testProductValidationCoversSlugPluginFolderAndStatus() {
  clearModule("src/validators/schemas.js");
  const { createProductSchema } = require(path.join(root, "src/validators/schemas.js"));

  const valid = runValidation(createProductSchema, {
    name: "Product",
    slug: "product-slug",
    internalProductCode: "PRODUCT_1",
    status: "published",
    pluginFolder: "product-folder",
    pluginSlug: "product-slug",
    mainPluginFile: "product.php",
    currency: "usd",
  });
  assert.strictEqual(valid.nextCalled, true);
  assert.strictEqual(valid.req.body.currency, "USD");

  const invalid = runValidation(createProductSchema, {
    name: "Product",
    status: "retired",
    pluginFolder: "../bad",
    pluginSlug: "Bad Slug",
  });
  assert.strictEqual(invalid.nextCalled, false);
  assert.strictEqual(invalid.res.statusCode, 422);
}

function testAdminPermissionMiddlewareProtectsProductWrites() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "customer" } }, createRes(), (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testAdminProductListIncludesLifecycleStatsAndSearch,
    testPublicProductListOnlyShowsPublishedOrLegacyActive,
    testCreateProductAcceptsLifecycleFields,
    testUpdateProductRejectsMissingProduct,
    testProductValidationCoversSlugPluginFolderAndStatus,
    testAdminPermissionMiddlewareProtectsProductWrites,
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
