const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase7h_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase7h_test_refresh_secret_with_enough_entropy";
process.env.JWT_ACCESS_EXPIRES = "15m";
process.env.JWT_REFRESH_EXPIRES = "7d";
process.env.JWT_ISSUER = "parentheses-licensing-test";
process.env.JWT_AUDIENCE = "parentheses-licensing-users-test";
process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS = "3";
process.env.AUTH_LOGIN_LOCKOUT_MINUTES = "15";
process.env.AUTH_MAX_REFRESH_SESSIONS = "5";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function query(value) {
  return {
    select() { return Promise.resolve(value); },
    populate() { return this; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createUser(overrides = {}) {
  const user = {
    _id: overrides._id || "user_1",
    name: overrides.name || "Test User",
    email: overrides.email || "user@example.com",
    role: overrides.role || "customer",
    companyName: "",
    emailVerified: overrides.emailVerified ?? true,
    twoFactorEnabled: false,
    isActive: overrides.isActive ?? true,
    passwordHash: overrides.passwordHash || bcrypt.hashSync("ValidPass123", 12),
    refreshSessions: overrides.refreshSessions || [],
    failedLoginAttempts: overrides.failedLoginAttempts || 0,
    loginLockedUntil: overrides.loginLockedUntil,
    emailVerificationToken: overrides.emailVerificationToken,
    emailVerificationExpires: overrides.emailVerificationExpires,
    emailVerificationLastSentAt: overrides.emailVerificationLastSentAt,
    passwordResetToken: overrides.passwordResetToken,
    passwordResetExpires: overrides.passwordResetExpires,
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
  return user;
}

function createHarness(initialUser = createUser()) {
  const store = { user: initialUser, createdUsers: [], sentEmails: [] };

  const UserMock = {
    findOne(filter) {
      if (filter.email && store.user?.email === filter.email) return query(store.user);
      if (filter.emailVerificationToken && store.user?.emailVerificationToken === filter.emailVerificationToken) {
        if (!store.user.emailVerificationExpires || new Date(store.user.emailVerificationExpires) <= new Date()) return query(null);
        return query(store.user);
      }
      if (filter.passwordResetToken && store.user?.passwordResetToken === filter.passwordResetToken) {
        if (!store.user.passwordResetExpires || new Date(store.user.passwordResetExpires) <= new Date()) return query(null);
        return query(store.user);
      }
      return query(null);
    },
    findById(id) {
      if (store.user?._id === id) return query(store.user);
      return query(null);
    },
    async create(doc) {
      const user = createUser({ ...doc, _id: "created_1", passwordHash: doc.passwordHash });
      Object.assign(user, doc);
      store.createdUsers.push(user);
      store.user = user;
      return user;
    },
  };

  const notificationServiceMock = {
    async sendVerificationEmail(message) {
      store.sentEmails.push({ type: "verifyEmail", ...message });
      return { success: true };
    },
    async sendPasswordResetEmail(message) {
      store.sentEmails.push({ type: "passwordReset", ...message });
      return { success: true };
    },
  };

  return { store, mocks: { UserMock, notificationServiceMock } };
}

function loadAuthController(harness) {
  for (const relativePath of [
    "src/controllers/authController.js",
    "src/models/User.js",
    "src/services/notificationService.js",
    "src/utils/jwt.js",
    "src/config/env.js",
  ]) {
    clearModule(relativePath);
  }

  const userResolved = clearModule("src/models/User.js");
  require.cache[userResolved] = { id: userResolved, filename: userResolved, loaded: true, exports: harness.mocks.UserMock };

  const notificationResolved = clearModule("src/services/notificationService.js");
  require.cache[notificationResolved] = { id: notificationResolved, filename: notificationResolved, loaded: true, exports: harness.mocks.notificationServiceMock };

  return require(path.join(root, "src/controllers/authController.js"));
}

function createReq({ body = {}, cookies = {}, query = {}, user = null } = {}) {
  return {
    body,
    cookies,
    query,
    user,
    ip: "127.0.0.1",
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: [],
    headers: {},
    status(code) { this.statusCode = code; return this; },
    cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
    clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(handler, req) {
  const res = createRes();
  let nextError = null;
  await handler(req, res, (err) => { nextError = err; });
  return { res, error: nextError };
}

async function login(controller, body = { email: "user@example.com", password: "ValidPass123" }) {
  return call(controller.login, createReq({ body }));
}

async function testLoginSuccessIssuesAccessAndRefreshSession() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const { res, error } = await login(controller);

  assert.ifError(error);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.cookies.refreshToken.value);
  assert.strictEqual(harness.store.user.refreshSessions.length, 1);
  assert.strictEqual(harness.store.user.refreshSessions[0].tokenHash, hashToken(res.cookies.refreshToken.value));
}

async function testLoginFailureIncrementsCounter() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const { error } = await login(controller, { email: "user@example.com", password: "WrongPass123" });

  assert.strictEqual(error.statusCode, 401);
  assert.strictEqual(harness.store.user.failedLoginAttempts, 1);
}

async function testLockedAccountRejected() {
  const harness = createHarness(createUser({ loginLockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 3 }));
  const controller = loadAuthController(harness);
  const { error } = await login(controller);

  assert.strictEqual(error.statusCode, 423);
}

async function testRefreshTokenRotationRejectsReplay() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const loginResult = await login(controller);
  const oldRefresh = loginResult.res.cookies.refreshToken.value;

  const refreshed = await call(controller.refresh, createReq({ cookies: { refreshToken: oldRefresh } }));
  assert.ifError(refreshed.error);
  const newRefresh = refreshed.res.cookies.refreshToken.value;
  assert.ok(newRefresh);
  assert.notStrictEqual(newRefresh, oldRefresh);
  assert.strictEqual(harness.store.user.refreshSessions.length, 1);
  assert.strictEqual(harness.store.user.refreshSessions[0].tokenHash, hashToken(newRefresh));

  const replay = await call(controller.refresh, createReq({ cookies: { refreshToken: oldRefresh } }));
  assert.strictEqual(replay.error.statusCode, 401);
  assert.strictEqual(harness.store.user.refreshSessions.length, 0);
}

async function testExpiredRefreshRejected() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const expiredToken = jwt.sign(
    { id: "user_1", role: "customer" },
    process.env.JWT_REFRESH_SECRET,
    {
      algorithm: "HS256",
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      jwtid: "expired_session",
      expiresIn: "-1s",
    }
  );

  const { error } = await call(controller.refresh, createReq({ cookies: { refreshToken: expiredToken } }));
  assert.strictEqual(error.name, "TokenExpiredError");
}

async function testLogoutRevokesRefreshSession() {
  const harness = createHarness();
  const controller = loadAuthController(harness);
  const loginResult = await login(controller);
  const refreshToken = loginResult.res.cookies.refreshToken.value;

  const { res, error } = await call(controller.logout, createReq({ cookies: { refreshToken } }));
  assert.ifError(error);
  assert.strictEqual(harness.store.user.refreshSessions.length, 0);
  assert.strictEqual(res.clearedCookies[0].name, "refreshToken");
}

async function testPasswordResetClearsTokenAndSessions() {
  const rawToken = "reset-token";
  const harness = createHarness(createUser({
    passwordResetToken: hashToken(rawToken),
    passwordResetExpires: new Date(Date.now() + 60_000),
    refreshSessions: [{ sessionId: "s1", tokenHash: "hash", expiresAt: new Date(Date.now() + 60_000) }],
  }));
  const controller = loadAuthController(harness);

  const { error } = await call(controller.resetPassword, createReq({ body: { token: rawToken, password: "NewPass123" } }));
  assert.ifError(error);
  assert.strictEqual(harness.store.user.passwordResetToken, undefined);
  assert.strictEqual(harness.store.user.passwordResetExpires, undefined);
  assert.deepStrictEqual(harness.store.user.refreshSessions, []);
  assert.ok(await bcrypt.compare("NewPass123", harness.store.user.passwordHash));
}

async function testEmailVerificationOneTimeUse() {
  const rawToken = "verify-token";
  const harness = createHarness(createUser({
    emailVerified: false,
    emailVerificationToken: hashToken(rawToken),
    emailVerificationExpires: new Date(Date.now() + 60_000),
  }));
  const controller = loadAuthController(harness);

  const first = await call(controller.verifyEmail, createReq({ query: { token: rawToken } }));
  assert.ifError(first.error);
  assert.strictEqual(harness.store.user.emailVerified, true);
  assert.ok(harness.store.user.emailVerifiedAt);
  assert.strictEqual(harness.store.user.emailVerificationSource, "email");
  assert.strictEqual(harness.store.user.emailVerificationToken, undefined);

  const second = await call(controller.verifyEmail, createReq({ query: { token: rawToken } }));
  assert.strictEqual(second.error.statusCode, 400);
}

async function testRegistrationSendsVerificationAndPersistsToken() {
  const harness = createHarness(null);
  const controller = loadAuthController(harness);
  const { res, error } = await call(controller.register, createReq({ body: {
    name: "New Customer",
    email: "new@example.com",
    password: "ValidPass123",
    companyName: "Acme",
  } }));

  assert.ifError(error);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.emailSent, true);
  assert.ok(harness.store.user.emailVerificationToken);
  assert.ok(harness.store.user.emailVerificationExpires > new Date());
  assert.strictEqual(harness.store.sentEmails.length, 1);
}

async function testResendVerificationAndCooldown() {
  const harness = createHarness(createUser({ emailVerified: false }));
  const controller = loadAuthController(harness);
  const first = await call(controller.resendVerification, createReq({ body: { email: "user@example.com" } }));
  assert.ifError(first.error);
  assert.strictEqual(first.res.body.data.cooldownSeconds, 60);
  assert.strictEqual(harness.store.sentEmails.length, 1);

  const second = await call(controller.resendVerification, createReq({ body: { email: "user@example.com" } }));
  assert.strictEqual(second.error.statusCode, 429);
  assert.strictEqual(second.error.code, "VERIFICATION_RESEND_COOLDOWN");
  assert.ok(Number(second.res.headers["Retry-After"]) > 0);
}

async function testRequireAuthAndRoleAuthorization() {
  const harness = createHarness(createUser({ role: "customer" }));
  loadAuthController(harness);
  const { signAccessToken } = require(path.join(root, "src/utils/jwt.js"));
  const { requireAuth, requireRole } = require(path.join(root, "src/middleware/auth.js"));
  const token = signAccessToken({ id: "user_1", role: "customer" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authError = null;
  await requireAuth(req, createRes(), (err) => { authError = err; });
  assert.ifError(authError);
  assert.strictEqual(req.user._id, "user_1");

  let roleError = null;
  requireRole("admin")(req, createRes(), (err) => { roleError = err; });
  assert.strictEqual(roleError.statusCode, 403);
}

async function run() {
  const tests = [
    testLoginSuccessIssuesAccessAndRefreshSession,
    testLoginFailureIncrementsCounter,
    testLockedAccountRejected,
    testRefreshTokenRotationRejectsReplay,
    testExpiredRefreshRejected,
    testLogoutRevokesRefreshSession,
    testPasswordResetClearsTokenAndSessions,
    testEmailVerificationOneTimeUse,
    testRegistrationSendsVerificationAndPersistsToken,
    testResendVerificationAndCooldown,
    testRequireAuthAndRoleAuthorization,
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
