const assert = require("assert");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase9b_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase9b_test_refresh_secret_with_enough_entropy";
process.env.JWT_ACCESS_EXPIRES = "15m";
process.env.JWT_REFRESH_EXPIRES = "7d";
process.env.JWT_ISSUER = "parentheses-licensing-test";
process.env.JWT_AUDIENCE = "parentheses-licensing-users-test";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    select() { return Promise.resolve(value); },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function createUser(overrides = {}) {
  return {
    _id: overrides._id || "user_1",
    name: overrides.name || "Test User",
    email: overrides.email || "user@example.com",
    role: overrides.role || "customer",
    companyName: overrides.companyName || "",
    emailVerified: overrides.emailVerified ?? true,
    twoFactorEnabled: false,
    isActive: overrides.isActive ?? true,
    passwordHash: overrides.passwordHash || bcrypt.hashSync("CurrentPass123", 12),
    refreshSessions: overrides.refreshSessions || [],
    async comparePassword(password) {
      return bcrypt.compare(password, this.passwordHash);
    },
    async save() {
      return this;
    },
    toSafeJSON() {
      return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        companyName: this.companyName,
        emailVerified: this.emailVerified,
        twoFactorEnabled: this.twoFactorEnabled,
        isActive: this.isActive,
      };
    },
  };
}

function createHarness(initialUser = createUser()) {
  const store = { user: initialUser, auditLogs: [] };
  const UserMock = {
    findById(id) {
      if (store.user?._id === id?.toString()) return query(store.user);
      return query(null);
    },
  };
  const auditLogMock = {
    async writeAuditLog(entry) {
      store.auditLogs.push(entry);
    },
  };
  return { store, mocks: { UserMock, auditLogMock } };
}

function loadAccountController(harness) {
  for (const relativePath of [
    "src/controllers/accountController.js",
    "src/models/User.js",
    "src/utils/auditLog.js",
    "src/utils/jwt.js",
    "src/config/env.js",
  ]) {
    clearModule(relativePath);
  }

  const userResolved = clearModule("src/models/User.js");
  require.cache[userResolved] = { id: userResolved, filename: userResolved, loaded: true, exports: harness.mocks.UserMock };

  const auditResolved = clearModule("src/utils/auditLog.js");
  require.cache[auditResolved] = { id: auditResolved, filename: auditResolved, loaded: true, exports: harness.mocks.auditLogMock };

  return require(path.join(root, "src/controllers/accountController.js"));
}

function createReq({ body = {}, cookies = {}, user = createUser() } = {}) {
  return {
    body,
    cookies,
    user,
    ip: "127.0.0.1",
    id: "phase9b-request",
    headers: {},
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
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  return { res, error: nextError };
}

function signRefreshToken(sessionId = "current_session") {
  return jwt.sign(
    { id: "user_1", role: "customer" },
    process.env.JWT_REFRESH_SECRET,
    {
      algorithm: "HS256",
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      jwtid: sessionId,
      expiresIn: "7d",
    }
  );
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

async function testGetProfileReturnsSafeUser() {
  const user = createUser({ name: "Profile User", companyName: "Acme" });
  const harness = createHarness(user);
  const controller = loadAccountController(harness);

  const { res, error } = await call(controller.getProfile, createReq({ user }));

  assert.ifError(error);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.name, "Profile User");
  assert.strictEqual(res.body.data.companyName, "Acme");
  assert.strictEqual(res.body.data.passwordHash, undefined);
}

async function testProfileUpdateWhitelistsAllowedFieldsAndAudits() {
  const user = createUser();
  const harness = createHarness(user);
  const controller = loadAccountController(harness);

  const { res, error } = await call(controller.updateProfile, createReq({
    user,
    body: { name: "Updated User", companyName: "Updated Co" },
  }));

  assert.ifError(error);
  assert.strictEqual(res.body.message, "Profile updated.");
  assert.strictEqual(harness.store.user.name, "Updated User");
  assert.strictEqual(harness.store.user.companyName, "Updated Co");
  assert.strictEqual(harness.store.auditLogs[0].action, "account.profile_updated");
  assert.strictEqual(harness.store.auditLogs[0].targetId, "user_1");
  assert.strictEqual(harness.store.auditLogs[0].ip, "127.0.0.1");
  assert.ok(harness.store.auditLogs[0].metadata.changedFields.includes("name"));
}

async function testProfileValidationRejectsPrivilegedFields() {
  clearModule("src/validators/schemas.js");
  const { profileUpdateSchema } = require(path.join(root, "src/validators/schemas.js"));
  const { res, nextCalled } = runValidation(profileUpdateSchema, {
    name: "Updated User",
    role: "admin",
    emailVerified: true,
    isActive: false,
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 422);
  assert.match(res.body.message, /Unrecognized key/);
}

async function testChangePasswordVerifiesCurrentPasswordAndKeepsCurrentSession() {
  const user = createUser({
    refreshSessions: [
      { sessionId: "current_session", tokenHash: "current", expiresAt: new Date(Date.now() + 60_000) },
      { sessionId: "other_session", tokenHash: "other", expiresAt: new Date(Date.now() + 60_000) },
    ],
  });
  const harness = createHarness(user);
  const controller = loadAccountController(harness);

  const { res, error } = await call(controller.changePassword, createReq({
    user,
    cookies: { refreshToken: signRefreshToken("current_session") },
    body: { currentPassword: "CurrentPass123", newPassword: "NewPass123", confirmPassword: "NewPass123" },
  }));

  assert.ifError(error);
  assert.strictEqual(res.body.message, "Password changed successfully.");
  assert.strictEqual(harness.store.user.refreshSessions.length, 1);
  assert.strictEqual(harness.store.user.refreshSessions[0].sessionId, "current_session");
  assert.ok(await bcrypt.compare("NewPass123", harness.store.user.passwordHash));
  assert.strictEqual(harness.store.auditLogs[0].action, "account.password_changed");
  assert.strictEqual(harness.store.auditLogs[0].metadata.revokedSessions, 1);
}

async function testChangePasswordInvalidCurrentPasswordRejected() {
  const user = createUser();
  const oldHash = user.passwordHash;
  const harness = createHarness(user);
  const controller = loadAccountController(harness);

  const { error } = await call(controller.changePassword, createReq({
    user,
    body: { currentPassword: "WrongPass123", newPassword: "NewPass123", confirmPassword: "NewPass123" },
  }));

  assert.strictEqual(error.statusCode, 401);
  assert.strictEqual(harness.store.user.passwordHash, oldHash);
  assert.strictEqual(harness.store.auditLogs.length, 0);
}

async function testChangePasswordWithoutCurrentSessionRevokesAllSessions() {
  const user = createUser({
    refreshSessions: [
      { sessionId: "s1", tokenHash: "one", expiresAt: new Date(Date.now() + 60_000) },
      { sessionId: "s2", tokenHash: "two", expiresAt: new Date(Date.now() + 60_000) },
    ],
  });
  const harness = createHarness(user);
  const controller = loadAccountController(harness);

  const { error } = await call(controller.changePassword, createReq({
    user,
    body: { currentPassword: "CurrentPass123", newPassword: "NewPass123", confirmPassword: "NewPass123" },
  }));

  assert.ifError(error);
  assert.deepStrictEqual(harness.store.user.refreshSessions, []);
  assert.strictEqual(harness.store.auditLogs[0].metadata.revokedSessions, 2);
}

async function testChangePasswordValidationRejectsMismatchAndWeakPassword() {
  clearModule("src/validators/schemas.js");
  const { changePasswordSchema } = require(path.join(root, "src/validators/schemas.js"));

  const mismatch = runValidation(changePasswordSchema, {
    currentPassword: "CurrentPass123",
    newPassword: "NewPass123",
    confirmPassword: "Different123",
  });
  assert.strictEqual(mismatch.nextCalled, false);
  assert.strictEqual(mismatch.res.statusCode, 422);
  assert.match(mismatch.res.body.message, /Passwords do not match/);

  const weak = runValidation(changePasswordSchema, {
    currentPassword: "CurrentPass123",
    newPassword: "weakpass",
    confirmPassword: "weakpass",
  });
  assert.strictEqual(weak.nextCalled, false);
  assert.strictEqual(weak.res.statusCode, 422);
}

async function testRequireAuthRejectsUnauthorizedProfileRequests() {
  const { requireAuth } = require(path.join(root, "src/middleware/auth.js"));
  const req = { headers: {} };
  let authError = null;

  await requireAuth(req, createRes(), (err) => { authError = err; });

  assert.strictEqual(authError.statusCode, 401);
}

async function run() {
  const tests = [
    testGetProfileReturnsSafeUser,
    testProfileUpdateWhitelistsAllowedFieldsAndAudits,
    testProfileValidationRejectsPrivilegedFields,
    testChangePasswordVerifiesCurrentPasswordAndKeepsCurrentSession,
    testChangePasswordInvalidCurrentPasswordRejected,
    testChangePasswordWithoutCurrentSessionRevokesAllSessions,
    testChangePasswordValidationRejectsMismatchAndWeakPassword,
    testRequireAuthRejectsUnauthorizedProfileRequests,
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
