const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase9g_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase9g_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");
const customerId = "507f1f77bcf86cd799439011";
const adminId = "507f1f77bcf86cd799439012";

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    select() { return this; },
    populate() { return this; },
    lean() { return Promise.resolve(value); },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function createUser(overrides = {}) {
  return {
    _id: overrides._id || customerId,
    name: overrides.name || "Customer One",
    email: overrides.email || "customer@example.test",
    role: overrides.role || "customer",
    companyName: overrides.companyName || "Acme",
    emailVerified: overrides.emailVerified ?? false,
    twoFactorEnabled: false,
    isActive: overrides.isActive ?? true,
    isSuspended: overrides.isSuspended ?? false,
    refreshSessions: overrides.refreshSessions || [],
    internalNotes: overrides.internalNotes || [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    async save() { return this; },
    toSafeJSON() {
      return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        companyName: this.companyName,
        emailVerified: this.emailVerified,
        isActive: this.isActive,
        isSuspended: this.isSuspended,
      };
    },
  };
}

function createHarness(initialUser = createUser()) {
  const store = {
    user: initialUser,
    auditLogs: [],
    notifications: [],
  };

  const UserMock = {
    async populate(value) { return value; },
    findById(id) {
      return query(store.user && store.user._id.toString() === id.toString() ? store.user : null);
    },
    findByIdAndUpdate(id, updates) {
      if (!store.user || store.user._id.toString() !== id.toString()) return Promise.resolve(null);
      Object.assign(store.user, updates);
      return Promise.resolve(store.user);
    },
  };

  const emptyQueryModel = {
    find() { return query([]); },
    countDocuments() { return Promise.resolve(0); },
    aggregate() { return Promise.resolve([]); },
  };

  const AuditLogMock = {
    find() { return query([]); },
    countDocuments() { return Promise.resolve(0); },
  };

  return { store, mocks: { UserMock, emptyQueryModel, AuditLogMock } };
}

function loadController(harness) {
  for (const relativePath of [
    "src/controllers/adminUserController.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/SupportTicket.js",
    "src/models/AuditLog.js",
    "src/utils/auditLog.js",
    "src/services/notificationService.js",
    "src/config/env.js",
  ]) clearModule(relativePath);

  for (const [relativePath, mock] of [
    ["src/models/User.js", harness.mocks.UserMock],
    ["src/models/License.js", harness.mocks.emptyQueryModel],
    ["src/models/Order.js", harness.mocks.emptyQueryModel],
    ["src/models/Download.js", harness.mocks.emptyQueryModel],
    ["src/models/SupportTicket.js", harness.mocks.emptyQueryModel],
    ["src/models/AuditLog.js", harness.mocks.AuditLogMock],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => harness.store.auditLogs.push(entry) }],
    ["src/services/notificationService.js", {
      sendPasswordResetEmail: async (payload) => {
        harness.store.notifications.push(payload);
        return { success: true, provider: "test" };
      },
    }],
    ["src/config/env.js", { getConfig: () => ({ app: { clientOrigins: ["http://client.test"] } }) }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }

  return require(path.join(root, "src/controllers/adminUserController.js"));
}

function createReq({ body = {}, params = { id: customerId }, user = { _id: adminId, role: "admin", email: "admin@example.test" } } = {}) {
  return { body, params, user, ip: "127.0.0.1", id: "phase9g-request" };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req = createReq()) {
  const res = createRes();
  let error = null;
  await handler(req, res, (err) => { error = err; });
  return { res, error };
}

function runValidation(schema, body) {
  const { validateRequest, idParamSchema } = require(path.join(root, "src/validators/schemas.js"));
  const middleware = validateRequest({ params: idParamSchema, body: schema });
  const req = createReq({ body });
  const res = createRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

async function testProfileUpdateAuditsAndWhitelists() {
  const harness = createHarness();
  const controller = loadController(harness);
  const { res, error } = await call(controller.updateCustomerProfile, createReq({
    body: { name: "Updated Customer", companyName: "Updated Co" },
  }));

  assert.ifError(error);
  assert.strictEqual(res.body.data.name, "Updated Customer");
  assert.strictEqual(harness.store.user.companyName, "Updated Co");
  assert.strictEqual(harness.store.auditLogs[0].action, "admin.user.profile_updated");
  assert.deepStrictEqual(harness.store.auditLogs[0].metadata.changedFields, ["name", "companyName"]);
}

async function testStatusSuspendRevokesSessionsAndAudits() {
  const harness = createHarness(createUser({
    refreshSessions: [{ sessionId: "s1" }, { sessionId: "s2" }],
  }));
  const controller = loadController(harness);
  const { res, error } = await call(controller.updateCustomerStatus, createReq({ body: { action: "suspend" } }));

  assert.ifError(error);
  assert.strictEqual(res.body.data.isSuspended, true);
  assert.strictEqual(harness.store.user.refreshSessions.length, 0);
  assert.strictEqual(harness.store.auditLogs[0].action, "admin.user.suspend");
}

async function testSelfStatusActionRejected() {
  const controller = loadController(createHarness(createUser({ _id: adminId })));
  const { error } = await call(controller.updateCustomerStatus, createReq({
    params: { id: adminId },
    user: { _id: adminId, role: "admin", email: "admin@example.test" },
    body: { action: "deactivate" },
  }));

  assert.strictEqual(error.statusCode, 403);
}

async function testEmailVerificationAndInternalNote() {
  const harness = createHarness();
  const controller = loadController(harness);
  const verified = await call(controller.updateCustomerEmailVerification, createReq({ body: { emailVerified: true } }));
  assert.ifError(verified.error);
  assert.strictEqual(harness.store.user.emailVerified, true);
  assert.ok(harness.store.user.emailVerifiedAt);
  assert.strictEqual(harness.store.user.emailVerificationSource, "manual_admin");
  assert.strictEqual(harness.store.auditLogs[0].action, "admin.user.email_verified");

  const noted = await call(controller.addCustomerInternalNote, createReq({ body: { body: "VIP renewal discussion." } }));
  assert.ifError(noted.error);
  assert.strictEqual(noted.res.statusCode, 201);
  assert.strictEqual(harness.store.user.internalNotes[0].body, "VIP renewal discussion.");
  assert.strictEqual(harness.store.auditLogs[1].action, "admin.user.internal_note_created");
}

async function testPasswordResetAndSessionRevocation() {
  const harness = createHarness(createUser({
    refreshSessions: [{ sessionId: "s1" }, { sessionId: "s2" }],
  }));
  const controller = loadController(harness);
  const forced = await call(controller.forceCustomerPasswordReset);

  assert.ifError(forced.error);
  assert.strictEqual(harness.store.user.refreshSessions.length, 0);
  assert.ok(harness.store.user.passwordResetToken);
  assert.strictEqual(harness.store.notifications.length, 1);
  assert.strictEqual(harness.store.auditLogs[0].action, "admin.user.password_reset_forced");
  assert.strictEqual(harness.store.auditLogs[0].metadata.revokedSessions, 2);

  harness.store.user.refreshSessions = [{ sessionId: "s3" }];
  const revoked = await call(controller.revokeCustomerSessions);
  assert.ifError(revoked.error);
  assert.strictEqual(revoked.res.body.data.revokedSessions, 1);
  assert.strictEqual(harness.store.auditLogs[1].action, "admin.user.sessions_revoked");
}

async function testValidationRejectsPrivilegedFields() {
  clearModule("src/validators/schemas.js");
  const { adminUserProfileUpdateSchema, adminUserStatusSchema } = require(path.join(root, "src/validators/schemas.js"));
  const profile = runValidation(adminUserProfileUpdateSchema, { name: "Valid Name", role: "admin" });
  assert.strictEqual(profile.nextCalled, false);
  assert.strictEqual(profile.res.statusCode, 422);

  const status = runValidation(adminUserStatusSchema, { action: "delete" });
  assert.strictEqual(status.nextCalled, false);
  assert.strictEqual(status.res.statusCode, 422);
}

async function testSuspendedUserRejectedByAuthMiddleware() {
  const user = createUser({ isSuspended: true });
  const UserMock = { findById: () => query(user) };
  const resolved = clearModule("src/models/User.js");
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: UserMock };
  const jwtResolved = clearModule("src/utils/jwt.js");
  require.cache[jwtResolved] = { id: jwtResolved, filename: jwtResolved, loaded: true, exports: { verifyAccessToken: () => ({ id: customerId }) } };
  clearModule("src/middleware/auth.js");
  const { requireAuth } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;

  await requireAuth({ headers: { authorization: "Bearer token" } }, createRes(), (err) => { error = err; });

  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testProfileUpdateAuditsAndWhitelists,
    testStatusSuspendRevokesSessionsAndAudits,
    testSelfStatusActionRejected,
    testEmailVerificationAndInternalNote,
    testPasswordResetAndSessionRevocation,
    testValidationRejectsPrivilegedFields,
    testSuspendedUserRejectedByAuthMiddleware,
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
