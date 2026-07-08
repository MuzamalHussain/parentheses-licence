const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase13e_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase13e_test_refresh_secret_with_enough_entropy";

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

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((branch) => matches(row, branch));
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(row[key]));
    if (value && typeof value === "object" && "$lt" in value) return new Date(row[key]).getTime() < new Date(value.$lt).getTime();
    if (value && typeof value === "object" && "$gte" in value) return new Date(row[key]).getTime() >= new Date(value.$gte).getTime();
    if (key.includes(".")) {
      const actual = key.split(".").reduce((acc, part) => acc?.[part], row);
      return String(actual) === String(value);
    }
    return value === undefined || String(row[key]) === String(value);
  });
}

function chain(value) {
  return {
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    populate() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function model(list, name) {
  return {
    find(filter = {}) { return chain(list.filter((row) => matches(row, filter))); },
    findOne(filter = {}) { return chain(list.find((row) => matches(row, filter)) || null); },
    async create(input) {
      const row = doc({ _id: `${name}_${list.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input });
      list.push(row);
      return row;
    },
    async countDocuments(filter = {}) { return list.filter((row) => matches(row, filter)).length; },
    async findByIdAndUpdate(id, update) {
      const row = list.find((item) => String(item._id) === String(id));
      if (row) Object.assign(row, update);
      return row || null;
    },
    async deleteMany(filter = {}) {
      const before = list.length;
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (matches(list[index], filter)) list.splice(index, 1);
      }
      return { deletedCount: before - list.length };
    },
  };
}

function loadComplianceWithMocks() {
  const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
  const store = {
    organizations: [doc({ _id: "607f1f77bcf86cd799439001", name: "Acme", status: "active" })],
    memberships: [
      doc({ _id: "mem_1", organizationId: "607f1f77bcf86cd799439001", userId: doc({ _id: "507f1f77bcf86cd799439001", name: "Admin", email: "admin@example.test", role: "admin" }), role: "owner", status: "active" }),
      doc({ _id: "mem_2", organizationId: "607f1f77bcf86cd799439001", userId: doc({ _id: "507f1f77bcf86cd799439002", name: "Ada", email: "ada@example.test", role: "customer" }), role: "viewer", status: "active" }),
    ],
    policies: [],
    exports: [],
    holds: [],
    consents: [],
    users: [
      doc({ _id: "507f1f77bcf86cd799439001", name: "Admin", email: "admin@example.test", role: "admin", activeOrganizationId: "607f1f77bcf86cd799439001" }),
      doc({ _id: "507f1f77bcf86cd799439002", name: "Ada", email: "ada@example.test", role: "customer", activeOrganizationId: "607f1f77bcf86cd799439001", companyName: "Ada Co", isActive: true }),
    ],
    licenses: [doc({ _id: "lic_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439002", status: "active", createdAt: oldDate })],
    orders: [doc({ _id: "ord_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439002", status: "completed", createdAt: oldDate })],
    downloads: [doc({ _id: "down_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439002", status: "completed", createdAt: new Date() })],
    payments: [doc({ _id: "pay_1", organizationId: "607f1f77bcf86cd799439001", orderId: "ord_1", status: "succeeded", createdAt: new Date() })],
    audits: [doc({ _id: "audit_1", metadata: { organizationId: "607f1f77bcf86cd799439001" }, action: "auth.login", createdAt: oldDate })],
    notifications: [doc({ _id: "notif_1", userId: "507f1f77bcf86cd799439002", createdAt: oldDate })],
    identityAudits: [doc({ _id: "id_audit_1", organizationId: "607f1f77bcf86cd799439001", status: "failed", createdAt: new Date() })],
    mfa: [doc({ _id: "mfa_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439001", status: "enabled" })],
    securityPolicies: [doc({ _id: "sec_1", organizationId: "607f1f77bcf86cd799439001" })],
    auditWrites: [],
  };

  [
    "src/services/compliance/ComplianceService.js",
    "src/models/CompliancePolicy.js",
    "src/models/ComplianceExport.js",
    "src/models/LegalHold.js",
    "src/models/ConsentRecord.js",
    "src/models/Organization.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/Payment.js",
    "src/models/AuditLog.js",
    "src/models/InAppNotification.js",
    "src/models/IdentityAuditEvent.js",
    "src/models/OrganizationMembership.js",
    "src/models/UserMfaMethod.js",
    "src/models/OrganizationSecurityPolicy.js",
    "src/models/OrganizationInvitation.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
  ].forEach(clearModule);

  setMock("src/models/CompliancePolicy.js", model(store.policies, "policy"));
  setMock("src/models/ComplianceExport.js", model(store.exports, "export"));
  setMock("src/models/LegalHold.js", model(store.holds, "hold"));
  setMock("src/models/ConsentRecord.js", model(store.consents, "consent"));
  setMock("src/models/Organization.js", model(store.organizations, "org"));
  setMock("src/models/User.js", model(store.users, "user"));
  setMock("src/models/License.js", model(store.licenses, "license"));
  setMock("src/models/Order.js", model(store.orders, "order"));
  setMock("src/models/Download.js", model(store.downloads, "download"));
  setMock("src/models/Payment.js", model(store.payments, "payment"));
  setMock("src/models/AuditLog.js", model(store.audits, "audit"));
  setMock("src/models/InAppNotification.js", model(store.notifications, "notification"));
  setMock("src/models/IdentityAuditEvent.js", model(store.identityAudits, "identity"));
  setMock("src/models/OrganizationMembership.js", model(store.memberships, "membership"));
  setMock("src/models/UserMfaMethod.js", model(store.mfa, "mfa"));
  setMock("src/models/OrganizationSecurityPolicy.js", model(store.securityPolicies, "security"));
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditWrites.push(entry) });

  return { store, service: require(path.join(root, "src/services/compliance/ComplianceService.js")) };
}

async function testDataExportJsonAndCsv() {
  const { service, store } = loadComplianceWithMocks();
  const json = await service.requestExport("607f1f77bcf86cd799439001", { format: "json", resources: ["users", "licenses", "orders"] }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(json.format, "json");
  assert.strictEqual(json.rowCounts.licenses, 1);
  const csv = await service.requestExport("607f1f77bcf86cd799439001", { format: "csv", resources: ["orders"] }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.ok(csv.payload.includes("resource"));
  assert.ok(store.auditWrites.some((entry) => entry.action === "compliance.export_completed"));
}

async function testLegalHoldPreventsDeletion() {
  const { service } = loadComplianceWithMocks();
  const hold = await service.createLegalHold("607f1f77bcf86cd799439001", { name: "GDPR dispute", protectedResources: ["users"], subjectUserId: "507f1f77bcf86cd799439002" }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(hold.status, "active");
  await assert.rejects(
    () => service.anonymizeUser("507f1f77bcf86cd799439002", "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } }),
    (err) => err.statusCode === 409
  );
}

async function testDataAnonymizationAndConsent() {
  const { service, store } = loadComplianceWithMocks();
  await service.recordConsent("507f1f77bcf86cd799439002", "607f1f77bcf86cd799439001", { type: "marketing", status: "granted" }, { actor: { _id: "507f1f77bcf86cd799439002", role: "customer" } });
  await service.recordConsent("507f1f77bcf86cd799439002", "607f1f77bcf86cd799439001", { type: "marketing", status: "withdrawn" }, { actor: { _id: "507f1f77bcf86cd799439002", role: "customer" } });
  const history = await service.consentHistory("507f1f77bcf86cd799439002", "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439002", role: "customer" } });
  assert.strictEqual(history.length, 2);
  const result = await service.anonymizeUser("507f1f77bcf86cd799439002", "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(result.anonymized, true);
  assert.ok(store.users[1].email.includes("@anonymous.local"));
}

async function testRetentionPolicyAndReports() {
  const { service } = loadComplianceWithMocks();
  await service.updatePolicy("607f1f77bcf86cd799439001", { retention: { auditLogRetentionDays: 30, orderRetentionDays: 30, licenseRetentionDays: 30, notificationRetentionDays: 30 } }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  const preview = await service.retentionPreview("607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(preview.orders, 1);
  assert.strictEqual(preview.licenses, 1);
  const security = await service.generateReport("607f1f77bcf86cd799439001", "security", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(security.failedLogins, 1);
  assert.strictEqual(security.mfaEnabledUsers, 1);
}

async function testPermissions() {
  const { service } = loadComplianceWithMocks();
  await assert.rejects(
    () => service.requestExport("607f1f77bcf86cd799439001", { format: "json" }, { actor: { _id: "507f1f77bcf86cd799439002", role: "customer" } }),
    (err) => err.statusCode === 403
  );
}

async function run() {
  const tests = [
    testDataExportJsonAndCsv,
    testLegalHoldPreventsDeletion,
    testDataAnonymizationAndConsent,
    testRetentionPolicyAndReports,
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
