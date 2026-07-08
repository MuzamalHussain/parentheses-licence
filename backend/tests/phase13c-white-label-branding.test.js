const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase13c_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase13c_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function setMock(relativePath, exports) {
  const resolved = clearModule(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function doc(data) {
  return { ...data, toObject() { return { ...this }; }, async save() { return this; } };
}

function chain(value) {
  return {
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function loadBrandingWithMocks() {
  const store = {
    orgs: [
      doc({ _id: "607f1f77bcf86cd799439001", name: "Acme", website: "https://acme.test", billingEmail: "billing@acme.test", status: "active", ownerId: "507f1f77bcf86cd799439001", branding: { supportEmail: "support@acme.test" } }),
      doc({ _id: "607f1f77bcf86cd799439002", name: "Other", status: "active", ownerId: "507f1f77bcf86cd799439002", branding: {} }),
    ],
    memberships: [
      doc({ _id: "mem_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439001", role: "owner", status: "active" }),
      doc({ _id: "mem_2", organizationId: "607f1f77bcf86cd799439002", userId: "507f1f77bcf86cd799439002", role: "owner", status: "active" }),
    ],
    brands: [],
    audits: [],
  };

  [
    "src/models/Organization.js",
    "src/models/OrganizationMembership.js",
    "src/models/OrganizationInvitation.js",
    "src/models/OrganizationBrand.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/LicenseSite.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
    "src/services/branding/BrandingService.js",
    "src/services/notifications/templates.js",
  ].forEach(clearModule);

  const Organization = {
    async findById(id) { return store.orgs.find((org) => String(org._id) === String(id)) || null; },
  };
  const Membership = {
    findOne(filter = {}) {
      return chain(store.memberships.find((item) =>
        String(item.organizationId) === String(filter.organizationId) &&
        String(item.userId) === String(filter.userId) &&
        item.status === filter.status
      ) || null);
    },
    find() { return chain([]); },
  };
  const Brand = {
    findOne(filter = {}) {
      const row = store.brands.find((brand) =>
        (filter.organizationId && String(brand.organizationId) === String(filter.organizationId)) ||
        (filter["domain.customDomain"] && brand.domain?.customDomain === filter["domain.customDomain"])
      ) || null;
      return chain(row);
    },
    async findOneAndUpdate(filter, update) {
      let row = store.brands.find((brand) => String(brand.organizationId) === String(filter.organizationId));
      if (!row) {
        row = doc({ organizationId: filter.organizationId });
        store.brands.push(row);
      }
      Object.assign(row, update.$setOnInsert || {});
      for (const [key, value] of Object.entries(update.$set || {})) {
        const parts = key.split(".");
        if (parts.length === 1) row[key] = value;
        else {
          row[parts[0]] = row[parts[0]] || {};
          row[parts[0]][parts[1]] = value;
        }
      }
      return row;
    },
    async findOneAndDelete(filter) {
      const index = store.brands.findIndex((brand) => String(brand.organizationId) === String(filter.organizationId));
      if (index >= 0) return store.brands.splice(index, 1)[0];
      return null;
    },
  };

  setMock("src/models/Organization.js", Organization);
  setMock("src/models/OrganizationMembership.js", Membership);
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/models/OrganizationBrand.js", Brand);
  setMock("src/models/User.js", { findByIdAndUpdate: async () => null });
  setMock("src/models/License.js", { countDocuments: async () => 0 });
  setMock("src/models/Order.js", { countDocuments: async () => 0 });
  setMock("src/models/Download.js", { countDocuments: async () => 0 });
  setMock("src/models/LicenseSite.js", { countDocuments: async () => 0 });
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    service: require(path.join(root, "src/services/branding/BrandingService.js")),
    templates: require(path.join(root, "src/services/notifications/templates.js")),
  };
}

async function testBrandUpdatesAndThemeRendering() {
  const { service, store } = loadBrandingWithMocks();
  const brand = await service.updateBrand("607f1f77bcf86cd799439001", {
    identity: { displayName: "Acme Cloud", tagline: "Enterprise licensing" },
    theme: { primaryColor: "#123456", buttonColor: "#abcdef" },
    typography: { borderRadius: 12 },
  }, { actor: { _id: "507f1f77bcf86cd799439001" } });
  assert.strictEqual(brand.identity.displayName, "Acme Cloud");
  assert.strictEqual(brand.theme.primaryColor, "#123456");
  assert.strictEqual(brand.typography.borderRadius, 12);
  assert.ok(store.audits.some((entry) => entry.action === "brand.theme_changed"));
}

async function testAssetValidationAndUpload() {
  const { service } = loadBrandingWithMocks();
  await assert.rejects(
    () => service.updateAsset("607f1f77bcf86cd799439001", "primaryLogo", { url: "javascript:alert(1)", contentType: "image/png" }, { actor: { _id: "507f1f77bcf86cd799439001" } }),
    (err) => err.code === "BRAND_INVALID_ASSET_URL"
  );
  const brand = await service.updateAsset("607f1f77bcf86cd799439001", "primaryLogo", { url: "/assets/acme.png", contentType: "image/png", fileSizeBytes: 1000 }, { actor: { _id: "507f1f77bcf86cd799439001" } });
  assert.strictEqual(brand.assets.primaryLogo.url, "/assets/acme.png");
}

async function testPermissionChecksAndOrganizationIsolation() {
  const { service } = loadBrandingWithMocks();
  await assert.rejects(
    () => service.updateBrand("607f1f77bcf86cd799439002", { identity: { displayName: "Stolen" } }, { actor: { _id: "507f1f77bcf86cd799439001" } }),
    (err) => err.code === "ORG_ACCESS_DENIED"
  );
}

async function testEmailBrandingAndWhiteLabel() {
  const { service, templates } = loadBrandingWithMocks();
  const brand = await service.updateBrand("607f1f77bcf86cd799439001", {
    identity: { displayName: "Acme Cloud", supportEmail: "help@acme.test" },
    email: { senderName: "Acme Support", footerHtml: "<p>Acme footer</p>" },
    whiteLabel: { hidePlatformReferences: true, hideParenthesesBranding: true, poweredByText: "Powered by Acme" },
  }, { actor: { _id: "507f1f77bcf86cd799439001" } });
  const rendered = templates.renderTemplate("welcome", { name: "Ava", brand });
  assert.strictEqual(rendered.senderName, "Acme Support");
  assert.ok(rendered.html.includes("Acme footer"));
  assert.ok(!rendered.subject.includes("Parentheses"));
}

async function testResetToDefaultsAndDomainFoundation() {
  const { service } = loadBrandingWithMocks();
  await service.updateBrand("607f1f77bcf86cd799439001", {
    identity: { displayName: "Acme Cloud" },
    domain: { customDomain: "portal.acme.test", validationStatus: "pending", dnsTarget: "cname.parentheses.test" },
  }, { actor: { _id: "507f1f77bcf86cd799439001" } });
  const byHost = await service.getBrandForRequest({ host: "portal.acme.test" });
  assert.strictEqual(byHost.identity.displayName, "Acme Cloud");
  const reset = await service.resetBrand("607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001" } });
  assert.strictEqual(reset.identity.displayName, "Acme");
}

async function run() {
  const tests = [
    testBrandUpdatesAndThemeRendering,
    testAssetValidationAndUpload,
    testPermissionChecksAndOrganizationIsolation,
    testEmailBrandingAndWhiteLabel,
    testResetToDefaultsAndDomainFoundation,
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
