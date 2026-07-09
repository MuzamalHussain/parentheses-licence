const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resolve = (rel) => path.join(root, rel);

const store = {
  products: [{
    _id: "prod_1",
    organizationId: "org_1",
    name: "Parentheses Pro",
    slug: "parentheses-pro",
    pluginSlug: "parentheses-pro",
    minWpVersion: "6.0",
    minPhpVersion: "8.0",
    testedUpTo: "6.6",
    dependencies: ["woocommerce"],
  }],
  versions: [{
    _id: "ver_1",
    productId: "prod_1",
    versionNumber: "2.0.0",
    versionName: "Major Release",
    status: "draft",
    releaseChannel: "stable",
    isPublished: false,
    isLatest: false,
    minWpVersion: "6.3",
    minPhpVersion: "8.1",
    testedUpTo: "6.6",
    pluginSlug: "parentheses-pro",
    originalFileName: "parentheses-pro.zip",
    fileSizeBytes: 2048,
    checksum: "",
    checksumMd5: "md5",
    sourceProvider: "github",
    sourceReleasePipelineId: "pipe_1",
    changelog: "Major release",
    releaseNotes: "Release notes",
    changelogSections: {
      newFeatures: "Adds smart release workflows.",
      bugFixes: "Fixes updater edge cases.",
      securityFixes: "Hardens package verification.",
      breakingChanges: "Requires updated templates.",
      developerNotes: "Database migration may run on first boot.",
    },
    buildMetadata: { commitSha: "abc123", branch: "main", releaseTag: "v2.0.0" },
  }, {
    _id: "ver_old",
    productId: "prod_1",
    versionNumber: "1.9.0",
    isPublished: true,
    releasedAt: new Date("2026-01-01T00:00:00.000Z"),
    minWpVersion: "6.0",
    minPhpVersion: "8.0",
  }],
  pipelines: [{
    _id: "pipe_1",
    productId: "prod_1",
    pluginVersionId: "ver_1",
    releaseTag: "v2.0.0",
    validationStatus: "warning",
    status: "validated",
    build: { commitSha: "abc123", branch: "main" },
  }],
  sites: [{
    _id: "site_1",
    organizationId: "org_1",
    productId: "prod_1",
    status: "active",
    pluginVersion: "1.9.0",
    wordpressVersion: "6.2",
    phpVersion: "8.1",
  }, {
    _id: "site_2",
    organizationId: "org_1",
    productId: "prod_1",
    status: "active",
    pluginVersion: "1.8.0",
    wordpressVersion: "6.4",
    phpVersion: "8.0",
  }],
  licenses: [{
    _id: "lic_1",
    organizationId: "org_1",
    productId: "prod_1",
    status: "active",
  }],
  memberships: [{ _id: "mem_1", organizationId: "org_1", status: "active" }],
  downloads: [{
    _id: "dl_1",
    organizationId: "org_1",
    productId: "prod_1",
    pluginVersionId: "ver_1",
    status: "completed",
  }, {
    _id: "dl_2",
    organizationId: "org_1",
    productId: "prod_1",
    pluginVersionId: "ver_1",
    status: "denied",
  }],
  tickets: [{
    _id: "ticket_1",
    subject: "Parentheses Pro upgrade problem",
    createdAt: new Date(),
  }],
  insights: [],
  audits: [],
};

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (value instanceof RegExp) return value.test(doc[key] || "");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(value, "$in")) return value.$in.includes(doc[key]);
      if (Object.prototype.hasOwnProperty.call(value, "$ne")) return doc[key] !== value.$ne;
      if (Object.prototype.hasOwnProperty.call(value, "$gte")) return new Date(doc[key]) >= new Date(value.$gte);
    }
    return doc[key] === value;
  });
}

function queryArray(items) {
  const chain = {
    sort: () => chain,
    select: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(items.map((item) => ({ ...item }))),
    catch: (handler) => chain.lean().catch(handler),
  };
  return chain;
}

function queryOne(item) {
  const chain = {
    sort: () => chain,
    lean: () => Promise.resolve(item ? { ...item } : null),
    catch: (handler) => chain.lean().catch(handler),
  };
  return chain;
}

function mockModule(rel, exportsValue) {
  const file = require.resolve(resolve(rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsValue };
}

function installMocks() {
  mockModule("src/models/Product.js", {
    findOne: (filter) => queryOne(store.products.find((doc) => matches(doc, filter))),
  });
  mockModule("src/models/PluginVersion.js", {
    findOne: (filter) => queryOne(store.versions.find((doc) => matches(doc, filter))),
  });
  mockModule("src/models/ReleasePipeline.js", {
    findById: (id) => queryOne(store.pipelines.find((doc) => doc._id === id)),
    findOne: (filter) => queryOne(store.pipelines.find((doc) => matches(doc, filter))),
  });
  mockModule("src/models/License.js", {
    countDocuments: (filter) => Promise.resolve(store.licenses.filter((doc) => matches(doc, filter)).length),
  });
  mockModule("src/models/LicenseSite.js", {
    find: (filter) => queryArray(store.sites.filter((doc) => matches(doc, filter))),
    countDocuments: (filter) => Promise.resolve(store.sites.filter((doc) => matches(doc, filter)).length),
  });
  mockModule("src/models/OrganizationMembership.js", {
    countDocuments: (filter) => Promise.resolve(store.memberships.filter((doc) => matches(doc, filter)).length),
  });
  mockModule("src/models/Download.js", {
    countDocuments: (filter) => Promise.resolve(store.downloads.filter((doc) => matches(doc, filter)).length),
  });
  mockModule("src/models/SupportTicket.js", {
    countDocuments: (filter) => Promise.resolve(store.tickets.filter((doc) => matches(doc, filter)).length),
  });
  mockModule("src/models/AIReleaseInsight.js", {
    create: async (payload) => {
      const insight = { _id: `insight_${store.insights.length + 1}`, ...payload, createdAt: new Date() };
      store.insights.unshift(insight);
      return insight;
    },
    find: (filter) => queryArray(store.insights.filter((doc) => matches(doc, filter))),
  });
  mockModule("src/services/ai/AIPermissionService.js", {
    assert: async (actor, organizationId, permission) => {
      if (permission !== "ai.release.read") throw new Error("Unexpected permission");
      if (actor?.role === "admin" || actor?.role === "super_admin") return true;
      if (actor?.activeOrganizationId === organizationId) return true;
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    },
  });
  mockModule("src/services/ai/AIAuditService.js", {
    record: async (event, payload) => store.audits.push({ event, payload }),
  });
}

installMocks();

const Service = require("../src/services/aiRelease/AIReleaseIntelligenceService");
const Compatibility = require("../src/services/aiRelease/AICompatibilityAnalyzer");
const Risk = require("../src/services/aiRelease/AIRiskAssessmentService");
const Controller = require("../src/controllers/adminAIReleaseController");

async function testReleaseAnalysis() {
  const data = await Service.analyze({
    actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" },
    organizationId: "org_1",
    productId: "prod_1",
    versionId: "ver_1",
  }, { ip: "127.0.0.1", requestId: "req_1" });

  assert.strictEqual(data.releaseAnalysis.version.versionNumber, "2.0.0");
  assert.strictEqual(data.releaseAnalysis.releaseMetadata.validationStatus, "warning");
  assert.strictEqual(data.releaseAnalysis.fileStructure.checksumSha256Present, false);
  assert.strictEqual(data.compatibility.wordpress.activeSitesBelowRequirement, 1);
  assert.strictEqual(data.compatibility.php.activeSitesBelowRequirement, 1);
  assert.strictEqual(data.releaseHealth.downloads, 1);
  assert.strictEqual(store.insights.length, 1);
}

async function testRiskAndRollout() {
  const insight = store.insights[0];
  assert.ok(["high", "critical"].includes(insight.riskAssessment.riskLevel));
  assert.ok(insight.riskAssessment.supportingEvidence.some((item) => item.source === "artifact"));
  assert.strictEqual(insight.rolloutStrategy.strategy, "limited_rollout");
  assert.strictEqual(insight.rolloutStrategy.rollbackPreparation, true);
  assert.match(insight.releaseNotes.customerReleaseNotes, /Parentheses Pro 2\.0\.0/);
  assert.strictEqual(store.audits.length, 4);
}

async function testHelpers() {
  assert.strictEqual(Compatibility.below("6.2", "6.3"), true);
  assert.strictEqual(Compatibility.below("6.4", "6.3"), false);
  assert.strictEqual(Risk.riskLevel(0), "low");
  assert.strictEqual(Risk.riskLevel(65), "high");
}

async function testHistoryAndPermissions() {
  const history = await Service.history({
    actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" },
    organizationId: "org_1",
    productId: "prod_1",
  });
  assert.strictEqual(history.length, 1);

  await assert.rejects(
    () => Service.history({
      actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_2" },
      organizationId: "org_1",
      productId: "prod_1",
    }),
    /Forbidden/,
  );
}

async function testController() {
  const req = {
    user: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" },
    body: { organizationId: "org_1", productId: "prod_1", versionId: "ver_1" },
    query: {},
    params: {},
    ip: "127.0.0.1",
    id: "req_2",
  };
  let statusCode = 200;
  let body;
  await Controller.analyze(req, {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; },
  }, (err) => { throw err; });
  assert.strictEqual(statusCode, 201);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.releaseAnalysis.product.slug, "parentheses-pro");
}

(async () => {
  await testReleaseAnalysis();
  await testRiskAndRollout();
  await testHelpers();
  await testHistoryAndPermissions();
  await testController();
  console.log("Phase 14G AI release intelligence tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
