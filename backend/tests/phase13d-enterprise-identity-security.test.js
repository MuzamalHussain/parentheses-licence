const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase13d_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase13d_test_refresh_secret_with_enough_entropy";

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
    sort() { return this; },
    limit() { return this; },
    lean: async () => value,
    select() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function loadIdentityWithMocks() {
  const store = {
    memberships: [
      doc({ _id: "mem_1", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439001", role: "owner", status: "active" }),
      doc({ _id: "mem_2", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439002", role: "viewer", status: "active" }),
    ],
    organizations: [doc({ _id: "607f1f77bcf86cd799439001", name: "Acme", status: "active" })],
    policies: [],
    providers: [],
    mfa: [],
    users: [
      doc({
        _id: "507f1f77bcf86cd799439001",
        name: "Admin",
        email: "admin@example.test",
        role: "admin",
        twoFactorEnabled: false,
        refreshSessions: [
          { sessionId: "sess_1", expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), loginAt: new Date(), lastUsedAt: new Date(), browser: "Chrome", operatingSystem: "Windows", ipAddress: "127.0.0.1" },
        ],
      }),
      doc({ _id: "507f1f77bcf86cd799439002", name: "Viewer", email: "viewer@example.test", role: "customer", twoFactorEnabled: false, refreshSessions: [] }),
    ],
    identityEvents: [],
    audits: [],
  };

  [
    "src/services/identity/EnterpriseIdentityService.js",
    "src/models/OrganizationIdentityProvider.js",
    "src/models/OrganizationSecurityPolicy.js",
    "src/models/UserMfaMethod.js",
    "src/models/IdentityAuditEvent.js",
    "src/models/User.js",
    "src/models/Organization.js",
    "src/models/OrganizationMembership.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
  ].forEach(clearModule);

  const Organization = {
    async findById(id) { return store.organizations.find((org) => String(org._id) === String(id)) || null; },
  };
  const Membership = {
    findOne(filter = {}) {
      return chain(store.memberships.find((item) =>
        String(item.organizationId) === String(filter.organizationId) &&
        String(item.userId) === String(filter.userId) &&
        (!filter.status || item.status === filter.status)
      ) || null);
    },
    find(filter = {}) {
      return chain(store.memberships.filter((item) =>
        String(item.organizationId) === String(filter.organizationId) &&
        (!filter.status || item.status === filter.status)
      ));
    },
  };
  const Policy = {
    findOne(filter = {}) {
      return chain(store.policies.find((item) => String(item.organizationId) === String(filter.organizationId)) || null);
    },
    async create(input) {
      const row = doc({ _id: `pol_${store.policies.length + 1}`, ...input });
      store.policies.push(row);
      return row;
    },
  };
  const Provider = {
    find(filter = {}) {
      return chain(store.providers.filter((item) => String(item.organizationId) === String(filter.organizationId)));
    },
    findOne(filter = {}) {
      return chain(store.providers.find((item) =>
        (!filter._id || String(item._id) === String(filter._id)) &&
        (!filter.organizationId || String(item.organizationId) === String(filter.organizationId))
      ) || null);
    },
  };
  function ProviderCtor(input) {
    const row = doc({ _id: `provider_${store.providers.length + 1}`, ...input });
    row.save = async function save() {
      const existing = store.providers.find((item) => item._id === this._id);
      if (!existing) store.providers.push(this);
      return this;
    };
    return row;
  }
  Object.assign(ProviderCtor, Provider);

  const Mfa = {
    find(filter = {}) {
      return chain(store.mfa.filter((item) => String(item.organizationId) === String(filter.organizationId) && (!filter.status || item.status === filter.status)));
    },
    findOne(filter = {}) {
      const value = store.mfa.find((item) =>
        String(item.userId) === String(filter.userId) &&
        String(item.organizationId) === String(filter.organizationId) &&
        item.method === filter.method &&
        (!filter.status || item.status === filter.status)
      ) || null;
      return chain(value);
    },
    async findOneAndUpdate(filter, update) {
      let row = store.mfa.find((item) => String(item.userId) === String(filter.userId) && String(item.organizationId) === String(filter.organizationId) && item.method === filter.method);
      if (!row) {
        row = doc({ _id: `mfa_${store.mfa.length + 1}` });
        store.mfa.push(row);
      }
      Object.assign(row, update);
      return row;
    },
    async updateMany(filter, update) {
      store.mfa.forEach((item) => {
        if (String(item.userId) === String(filter.userId) && String(item.organizationId) === String(filter.organizationId)) Object.assign(item, update);
      });
      return { modifiedCount: 1 };
    },
  };
  const User = {
    find(filter = {}) {
      const ids = (filter._id?.$in || []).map(String);
      return chain(store.users.filter((user) => ids.includes(String(user._id))));
    },
    findById(id) {
      return chain(store.users.find((user) => String(user._id) === String(id)) || null);
    },
    async findByIdAndUpdate(id, update) {
      const user = store.users.find((item) => String(item._id) === String(id));
      if (user) Object.assign(user, update);
      return user || null;
    },
  };
  const IdentityAudit = {
    async create(entry) {
      store.identityEvents.push(doc({ _id: `identity_${store.identityEvents.length + 1}`, createdAt: new Date(), ...entry }));
      return store.identityEvents[store.identityEvents.length - 1];
    },
    find(filter = {}) {
      return chain(store.identityEvents.filter((item) => String(item.organizationId) === String(filter.organizationId)));
    },
  };

  setMock("src/models/Organization.js", Organization);
  setMock("src/models/OrganizationMembership.js", Membership);
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/models/OrganizationIdentityProvider.js", ProviderCtor);
  setMock("src/models/OrganizationSecurityPolicy.js", Policy);
  setMock("src/models/UserMfaMethod.js", Mfa);
  setMock("src/models/IdentityAuditEvent.js", IdentityAudit);
  setMock("src/models/User.js", User);
  setMock("src/models/License.js", { countDocuments: async () => 0 });
  setMock("src/models/Order.js", { countDocuments: async () => 0 });
  setMock("src/models/Download.js", { countDocuments: async () => 0 });
  setMock("src/models/LicenseSite.js", { countDocuments: async () => 0 });
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return { store, service: require(path.join(root, "src/services/identity/EnterpriseIdentityService.js")) };
}

async function testSecurityPolicyAndPasswordValidation() {
  const { service, store } = loadIdentityWithMocks();
  const policy = await service.updatePolicy("607f1f77bcf86cd799439001", {
    mfa: { required: true },
    password: { minLength: 12, requireSymbol: true },
  }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(policy.mfa.required, true);
  assert.strictEqual(service.validatePassword("Password123", policy.password).valid, false);
  assert.strictEqual(service.validatePassword("Password123!", policy.password).valid, true);
  assert.ok(store.audits.some((entry) => entry.action === "identity.policy_changed"));
}

async function testProviderFoundationAndHealth() {
  const { service } = loadIdentityWithMocks();
  const provider = await service.saveProvider("607f1f77bcf86cd799439001", {
    name: "Acme Okta",
    provider: "okta",
    protocol: "oidc",
    configuration: { clientId: "client_123", issuerUrl: "https://okta.example.test" },
  }, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(provider.provider, "okta");
  const health = await service.testProvider("607f1f77bcf86cd799439001", provider._id, { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(health.healthy, true);
}

async function testMfaTotpAndRecoveryCodes() {
  const { service, store } = loadIdentityWithMocks();
  const setup = await service.startMfaSetup("507f1f77bcf86cd799439001", "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  const code = service.totp(setup.secret);
  const verified = await service.verifyMfaSetup("507f1f77bcf86cd799439001", code, "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(verified.enabled, true);
  assert.strictEqual(store.users[0].twoFactorEnabled, true);
  assert.strictEqual(await service.verifyMfa("507f1f77bcf86cd799439001", setup.recoveryCodes[0], "607f1f77bcf86cd799439001"), true);
}

async function testSessionPolicyAndRevocation() {
  const { service, store } = loadIdentityWithMocks();
  const overview = await service.overview("607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(overview.sessions.length, 1);
  const revoked = await service.revokeSession("507f1f77bcf86cd799439001", "sess_1", "607f1f77bcf86cd799439001", { actor: { _id: "507f1f77bcf86cd799439001", role: "admin" } });
  assert.strictEqual(revoked.revoked, 1);
  assert.strictEqual(store.users[0].refreshSessions.length, 0);
}

async function testPermissionChecksAndCompatibility() {
  const { service } = loadIdentityWithMocks();
  await assert.rejects(
    () => service.updatePolicy("607f1f77bcf86cd799439001", { mfa: { required: true } }, { actor: { _id: "507f1f77bcf86cd799439002", role: "customer" } }),
    (err) => err.statusCode === 403
  );
  const policy = await service.resolvePolicy(null);
  assert.strictEqual(policy.authentication.localLoginAllowed, true);
  assert.doesNotThrow(() => service.enforcePolicyForLogin({ _id: "u1" }, policy));
}

async function run() {
  const tests = [
    testSecurityPolicyAndPasswordValidation,
    testProviderFoundationAndHealth,
    testMfaTotpAndRecoveryCodes,
    testSessionPolicyAndRevocation,
    testPermissionChecksAndCompatibility,
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
