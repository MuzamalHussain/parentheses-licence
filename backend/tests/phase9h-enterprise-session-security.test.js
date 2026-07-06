const assert = require("assert");
const path = require("path");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase9h_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase9h_test_refresh_secret_with_enough_entropy";
process.env.JWT_ACCESS_EXPIRES = "15m";
process.env.JWT_REFRESH_EXPIRES = "7d";
process.env.JWT_ISSUER = "parentheses-licensing-test";
process.env.JWT_AUDIENCE = "parentheses-licensing-users-test";
process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS = "2";
process.env.AUTH_LOGIN_LOCKOUT_MINUTES = "15";
process.env.AUTH_MAX_REFRESH_SESSIONS = "5";

const root = path.resolve(__dirname, "..");
const userId = "507f1f77bcf86cd799439011";
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
    sort() {
      if (Array.isArray(current)) current.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return api;
    },
    limit(n) {
      if (Array.isArray(current)) current = current.slice(0, n);
      return api;
    },
    lean() { return Promise.resolve(current); },
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };
  return api;
}

function createUser(overrides = {}) {
  return {
    _id: overrides._id || userId,
    name: "Session User",
    email: "session@example.test",
    role: overrides.role || "customer",
    companyName: "",
    emailVerified: true,
    twoFactorEnabled: false,
    isActive: true,
    isSuspended: false,
    passwordHash: overrides.passwordHash || "$2a$12$0KY/b1oVDoAoHOSN4qV76.dQ1UK1J4WP2H0nuTSWjb6ybQrSQ2mXi",
    refreshSessions: overrides.refreshSessions || [],
    failedLoginAttempts: overrides.failedLoginAttempts || 0,
    loginLockedUntil: overrides.loginLockedUntil,
    async comparePassword(password) {
      return password === "ValidPass123";
    },
    async save() { return this; },
    toSafeJSON() { return { id: this._id, email: this.email, role: this.role, isActive: this.isActive }; },
  };
}

function hashToken(token) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signRefreshToken(sessionId = "session_1") {
  return jwt.sign(
    { id: userId, role: "customer" },
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

function createHarness(initialUser = createUser()) {
  const store = {
    user: initialUser,
    auditLogs: [
      { _id: "log_1", actorId: userId, action: "auth.login", targetType: "User", targetId: userId, ipAddress: "127.0.0.1", createdAt: new Date("2026-01-01T00:00:00Z"), metadata: {} },
      { _id: "log_2", actorId: userId, action: "auth.login_failed", targetType: "User", targetId: userId, ipAddress: "127.0.0.2", createdAt: new Date("2026-01-02T00:00:00Z"), metadata: { failedLoginAttempts: 1 } },
      { _id: "log_3", actorId: adminId, actorEmail: "admin@example.test", action: "admin.user.sessions_revoked", targetType: "User", targetId: userId, ipAddress: "127.0.0.3", createdAt: new Date("2026-01-03T00:00:00Z"), metadata: {} },
    ],
    writtenAuditLogs: [],
  };

  const UserMock = {
    findOne(filter) {
      if (filter.email && store.user.email === filter.email) return query(store.user);
      return query(null);
    },
    findById(id) {
      return query(store.user && store.user._id.toString() === id.toString() ? store.user : null);
    },
  };

  const AuditLogMock = {
    find(filter) {
      const rows = store.auditLogs.filter((log) => {
        if (filter.action?.$in && !filter.action.$in.includes(log.action)) return false;
        return log.actorId?.toString() === userId || (log.targetType === "User" && log.targetId?.toString() === userId);
      });
      return query(rows);
    },
  };

  return { store, mocks: { UserMock, AuditLogMock } };
}

function installCommonMocks(harness) {
  for (const [relativePath, mock] of [
    ["src/models/User.js", harness.mocks.UserMock],
    ["src/models/AuditLog.js", harness.mocks.AuditLogMock],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => harness.store.writtenAuditLogs.push(entry) }],
    ["src/services/notificationService.js", { sendVerificationEmail: async () => ({ success: true }), sendPasswordResetEmail: async () => ({ success: true }) }],
  ]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mock };
  }
}

function loadAuthController(harness) {
  for (const relativePath of ["src/controllers/authController.js", "src/models/User.js", "src/models/AuditLog.js", "src/utils/auditLog.js"]) {
    clearModule(relativePath);
  }
  installCommonMocks(harness);
  return require(path.join(root, "src/controllers/authController.js"));
}

function loadAccountController(harness) {
  for (const relativePath of ["src/controllers/accountController.js", "src/models/User.js", "src/models/AuditLog.js", "src/utils/auditLog.js"]) {
    clearModule(relativePath);
  }
  installCommonMocks(harness);
  return require(path.join(root, "src/controllers/accountController.js"));
}

function loadAdminController(harness) {
  for (const relativePath of [
    "src/controllers/adminUserController.js",
    "src/models/User.js",
    "src/models/AuditLog.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/SupportTicket.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);
  installCommonMocks(harness);
  const emptyModel = { find: () => query([]), countDocuments: () => Promise.resolve(0), aggregate: () => Promise.resolve([]) };
  for (const relativePath of ["src/models/License.js", "src/models/Order.js", "src/models/Download.js", "src/models/SupportTicket.js"]) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: emptyModel };
  }
  return require(path.join(root, "src/controllers/adminUserController.js"));
}

function createReq({ body = {}, cookies = {}, params = { id: userId }, user = null } = {}) {
  return {
    body,
    cookies,
    params,
    user: user || createUser(),
    ip: "127.0.0.1",
    id: "phase9h-request",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36",
      "x-forwarded-for": "203.0.113.10",
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: [],
    status(code) { this.statusCode = code; return this; },
    cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
    clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req) {
  const res = createRes();
  let error = null;
  await handler(req, res, (err) => { error = err; });
  return { res, error };
}

async function testSessionCreationStoresDeviceMetadataAndAuditsLogin() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const { error } = await call(controller.login, createReq({ body: { email: "session@example.test", password: "ValidPass123" } }));

  assert.ifError(error);
  const session = harness.store.user.refreshSessions[0];
  assert.strictEqual(session.browser, "Chrome");
  assert.strictEqual(session.operatingSystem, "Windows");
  assert.strictEqual(session.device, "Desktop");
  assert.strictEqual(session.ipAddress, "203.0.113.10");
  assert.strictEqual(harness.store.writtenAuditLogs.some((log) => log.action === "auth.login"), true);
}

async function testRefreshRotationAndReplayAudit() {
  const token = signRefreshToken("session_1");
  const harness = createHarness(createUser({
    refreshSessions: [{ sessionId: "session_1", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), lastUsedAt: new Date() }],
  }));
  const controller = loadAuthController(harness);
  const rotated = await call(controller.refresh, createReq({ cookies: { refreshToken: token } }));
  assert.ifError(rotated.error);
  assert.strictEqual(harness.store.writtenAuditLogs.some((log) => log.action === "auth.refresh_rotated"), true);

  const replay = await call(controller.refresh, createReq({ cookies: { refreshToken: token } }));
  assert.strictEqual(replay.error.statusCode, 401);
  assert.strictEqual(harness.store.writtenAuditLogs.some((log) => log.action === "auth.refresh_reuse_rejected"), true);
}

async function testFailedLoginLockoutAudited() {
  const harness = createHarness(createUser({ failedLoginAttempts: 1 }));
  const controller = loadAuthController(harness);
  const result = await call(controller.login, createReq({ body: { email: "session@example.test", password: "bad" } }));

  assert.strictEqual(result.error.statusCode, 401);
  assert.ok(harness.store.user.loginLockedUntil);
  assert.strictEqual(harness.store.writtenAuditLogs.some((log) => log.action === "auth.account_locked"), true);
}

async function testCustomerCanViewAndRevokeOnlyOwnSessions() {
  const token = signRefreshToken("current_session");
  const harness = createHarness(createUser({
    refreshSessions: [
      { sessionId: "current_session", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), browser: "Chrome", operatingSystem: "Windows", device: "Desktop", createdAt: new Date(), lastUsedAt: new Date() },
      { sessionId: "other_session", tokenHash: "hash", expiresAt: new Date(Date.now() + 60_000), browser: "Safari", operatingSystem: "macOS", device: "Desktop", createdAt: new Date(), lastUsedAt: new Date() },
    ],
  }));
  const controller = loadAccountController(harness);
  const sessions = await call(controller.getSessions, createReq({ cookies: { refreshToken: token } }));
  assert.ifError(sessions.error);
  assert.strictEqual(sessions.res.body.data.length, 2);
  assert.strictEqual(sessions.res.body.data.find((session) => session.sessionId === "current_session").currentSession, true);

  const revoked = await call(controller.revokeSession, createReq({ cookies: { refreshToken: token }, params: { sessionId: "other_session" } }));
  assert.ifError(revoked.error);
  assert.strictEqual(harness.store.user.refreshSessions.length, 1);
  assert.strictEqual(harness.store.writtenAuditLogs[0].action, "account.session_revoked");
}

async function testCustomerSecurityEventsScopedToOwnUser() {
  const harness = createHarness();
  const controller = loadAccountController(harness);
  const { res, error } = await call(controller.getSecurityEvents, createReq());

  assert.ifError(error);
  assert.strictEqual(res.body.data.loginHistory.length, 2);
  assert.strictEqual(res.body.data.securityEvents.some((event) => event.action === "admin.user.sessions_revoked"), true);
}

async function testAdminCanViewSecurityPanelAndTerminateSession() {
  const harness = createHarness(createUser({
    refreshSessions: [{ sessionId: "victim_session", tokenHash: "hash", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), lastUsedAt: new Date() }],
  }));
  const controller = loadAdminController(harness);
  const req = createReq({ user: { _id: adminId, role: "admin", email: "admin@example.test" } });
  const security = await call(controller.getCustomerSecurity, req);
  assert.ifError(security.error);
  assert.strictEqual(security.res.body.data.sessions.length, 1);
  assert.strictEqual(security.res.body.data.failedLogin.attemptCount, 0);

  const revoked = await call(controller.revokeCustomerSession, createReq({
    params: { id: userId, sessionId: "victim_session" },
    user: { _id: adminId, role: "admin", email: "admin@example.test" },
  }));
  assert.ifError(revoked.error);
  assert.strictEqual(harness.store.user.refreshSessions.length, 0);
  assert.strictEqual(harness.store.writtenAuditLogs[0].action, "admin.user.session_revoked");
}

async function testAdminPermissionMiddlewareRejectsCustomer() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "customer" } }, createRes(), (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testSessionCreationStoresDeviceMetadataAndAuditsLogin,
    testRefreshRotationAndReplayAudit,
    testFailedLoginLockoutAudited,
    testCustomerCanViewAndRevokeOnlyOwnSessions,
    testCustomerSecurityEventsScopedToOwnUser,
    testAdminCanViewSecurityPanelAndTerminateSession,
    testAdminPermissionMiddlewareRejectsCustomer,
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
