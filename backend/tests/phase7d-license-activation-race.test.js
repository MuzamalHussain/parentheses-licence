const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    populate() {
      return this;
    },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function cloneLicense(license) {
  if (!license) return null;
  return {
    ...license,
    productId: { ...license.productId },
    planId: { ...license.planId },
    activeDomains: license.activeDomains.map((domain) => ({ ...domain })),
    async save() {
      return this;
    },
  };
}

function createHarness({ allowedSites = 1, status = "active", expiresAt = null } = {}) {
  const store = {
    license: {
      _id: "lic_1",
      userId: { _id: "user_1", status: "active" },
      licenseKey: "TEST-KEY1-KEY2-KEY3",
      status,
      allowedSites,
      expiresAt,
      productId: { _id: "prod_1", name: "Parentheses", slug: "parentheses", status: "active" },
      planId: { _id: "plan_1", name: "Solo", allowedSites },
      activeDomains: [],
    },
    activationEvents: [],
    auditEvents: [],
  };

  function matchesFindOne(filter) {
    if (filter.licenseKey && filter.licenseKey !== store.license.licenseKey) return false;
    if (filter._id && filter._id !== store.license._id) return false;
    return true;
  }

  function canActivate(filter, domain) {
    const license = store.license;
    if (filter._id !== license._id) return false;
    if (filter.status && filter.status !== license.status) return false;
    if (license.expiresAt && license.expiresAt <= new Date()) return false;
    if (license.activeDomains.some((entry) => entry.domain === domain)) return false;
    return license.allowedSites === 0 || license.activeDomains.length < license.allowedSites;
  }

  const LicenseMock = {
    findOne(filter) {
      return query(matchesFindOne(filter) ? cloneLicense(store.license) : null);
    },
    findById(id) {
      return query(id === store.license._id ? cloneLicense(store.license) : null);
    },
    findOneAndUpdate(filter, update) {
      if (update.$push?.activeDomains) {
        const domain = update.$push.activeDomains.domain;
        if (!canActivate(filter, domain)) return query(null);
        store.license.activeDomains.push({ ...update.$push.activeDomains });
        return query(cloneLicense(store.license));
      }

      if (update.$pull?.activeDomains) {
        const domain = update.$pull.activeDomains.domain;
        const before = store.license.activeDomains.length;
        store.license.activeDomains = store.license.activeDomains.filter((entry) => entry.domain !== domain);
        return query(before === store.license.activeDomains.length ? null : cloneLicense(store.license));
      }

      return query(null);
    },
  };

  const LicenseActivationMock = {
    async create(doc) {
      store.activationEvents.push(doc);
      return doc;
    },
    async insertMany(docs) {
      store.activationEvents.push(...docs);
      return docs;
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

  return {
    store,
    mocks: { LicenseMock, LicenseActivationMock, PluginVersionMock, auditLogMock },
  };
}

function loadController(harness) {
  clearModule("src/controllers/pluginActivationController.js");
  const mappings = [
    ["src/models/License.js", harness.mocks.LicenseMock],
    ["src/models/LicenseActivation.js", harness.mocks.LicenseActivationMock],
    ["src/models/PluginVersion.js", harness.mocks.PluginVersionMock],
    ["src/utils/auditLog.js", harness.mocks.auditLogMock],
  ];

  for (const [relativePath, exports] of mappings) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }

  return require(path.join(root, "src/controllers/pluginActivationController.js"));
}

function createReq(body) {
  return { body, ip: "127.0.0.1" };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function call(handler, body) {
  const res = createRes();
  let nextError = null;
  await handler(createReq(body), res, (err) => {
    nextError = err;
  });
  if (nextError) throw nextError;
  return res;
}

const activationBody = (domain) => ({
  licenseKey: "TEST-KEY1-KEY2-KEY3",
  domain,
  product: "parentheses",
});

async function testSingleActivationSuccess() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);
  const res = await call(controller.activate, activationBody("https://example.com/path"));

  assert.strictEqual(res.statusCode, 201);
  assert.deepStrictEqual(harness.store.license.activeDomains.map((d) => d.domain), ["example.com"]);
  assert.strictEqual(harness.store.activationEvents.length, 1);
}

async function testSameDomainActivationIsIdempotent() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  const responses = await Promise.all(
    Array.from({ length: 10 }, () => call(controller.activate, activationBody("http://example.com/")))
  );

  assert.strictEqual(responses.filter((res) => res.statusCode < 400).length, 10);
  assert.strictEqual(harness.store.license.activeDomains.length, 1);
  assert.strictEqual(harness.store.activationEvents.length, 1);
}

async function testDifferentDomainRejectedWhenLimitReached() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  await call(controller.activate, activationBody("one.example.com"));
  const second = await call(controller.activate, activationBody("two.example.com"));

  assert.strictEqual(second.statusCode, 403);
  assert.strictEqual(harness.store.license.activeDomains.length, 1);
}

async function testDeactivationFreesSlot() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  await call(controller.activate, activationBody("one.example.com"));
  await call(controller.deactivate, activationBody("one.example.com"));
  const second = await call(controller.activate, activationBody("two.example.com"));

  assert.strictEqual(second.statusCode, 201);
  assert.deepStrictEqual(harness.store.license.activeDomains.map((d) => d.domain), ["two.example.com"]);
}

async function testReactivationObeysLimit() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  await call(controller.activate, activationBody("one.example.com"));
  await call(controller.deactivate, activationBody("one.example.com"));
  await call(controller.activate, activationBody("one.example.com"));
  const second = await call(controller.activate, activationBody("two.example.com"));

  assert.strictEqual(second.statusCode, 403);
  assert.deepStrictEqual(harness.store.license.activeDomains.map((d) => d.domain), ["one.example.com"]);
}

async function testConcurrentDifferentDomainsCannotExceedOneSiteLimit() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  const responses = await Promise.all(
    Array.from({ length: 10 }, (_, index) => call(controller.activate, activationBody(`site${index}.example.com`)))
  );

  assert.strictEqual(responses.filter((res) => res.statusCode === 201).length, 1);
  assert.strictEqual(responses.filter((res) => res.statusCode === 403).length, 9);
  assert.strictEqual(harness.store.license.activeDomains.length, 1);
}

async function testConcurrentDifferentDomainsCannotExceedThreeSiteLimit() {
  const harness = createHarness({ allowedSites: 3 });
  const controller = loadController(harness);

  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, index) => call(controller.activate, activationBody(`site${index}.example.com`)))
  );

  assert.strictEqual(responses.filter((res) => res.statusCode === 201).length, 3);
  assert.strictEqual(responses.filter((res) => res.statusCode === 403).length, 17);
  assert.strictEqual(harness.store.license.activeDomains.length, 3);
}

async function testSuspendedAndExpiredLicenseCannotActivate() {
  const suspended = createHarness({ status: "suspended" });
  let controller = loadController(suspended);
  let res = await call(controller.activate, activationBody("example.com"));
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(suspended.store.license.activeDomains.length, 0);

  const expired = createHarness({ expiresAt: new Date(Date.now() - 1000) });
  controller = loadController(expired);
  res = await call(controller.activate, activationBody("example.com"));
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(expired.store.license.activeDomains.length, 0);
}

async function testPluginValidationEndpointStillWorks() {
  const harness = createHarness({ allowedSites: 1 });
  const controller = loadController(harness);

  await call(controller.activate, activationBody("example.com"));
  const res = await call(controller.check, activationBody("https://example.com/wp-admin"));

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.valid, true);
  assert.strictEqual(res.body.domainValid, true);
}

async function run() {
  const tests = [
    testSingleActivationSuccess,
    testSameDomainActivationIsIdempotent,
    testDifferentDomainRejectedWhenLimitReached,
    testDeactivationFreesSlot,
    testReactivationObeysLimit,
    testConcurrentDifferentDomainsCannotExceedOneSiteLimit,
    testConcurrentDifferentDomainsCannotExceedThreeSiteLimit,
    testSuspendedAndExpiredLicenseCannotActivate,
    testPluginValidationEndpointStillWorks,
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
