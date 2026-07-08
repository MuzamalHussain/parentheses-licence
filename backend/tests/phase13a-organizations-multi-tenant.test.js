const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase13a_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase13a_test_refresh_secret_with_enough_entropy";

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

function makeDoc(data) {
  return {
    ...data,
    async save() { return this; },
  };
}

function chain(value) {
  return {
    populate() { return this; },
    select() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function loadOrganizationsWithMocks() {
  const store = {
    users: [
      { _id: "507f1f77bcf86cd799439001", email: "owner@example.test", name: "Owner" },
      { _id: "507f1f77bcf86cd799439002", email: "dev@example.test", name: "Developer" },
      { _id: "507f1f77bcf86cd799439003", email: "outside@example.test", name: "Outside" },
    ],
    organizations: [],
    memberships: [],
    invitations: [],
    audits: [],
    counts: { licenses: 2, orders: 3, downloads: 4, domains: 5 },
  };

  [
    "src/models/Organization.js",
    "src/models/OrganizationMembership.js",
    "src/models/OrganizationInvitation.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/LicenseSite.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
    "src/middleware/organizationContext.js",
  ].forEach(clearModule);

  const Organization = {
    async create(data) {
      const doc = makeDoc({ _id: `607f1f77bcf86cd79943900${store.organizations.length + 1}`, status: "active", ...data, slug: String(data.slug || data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") });
      store.organizations.push(doc);
      return doc;
    },
    async findById(id) {
      const row = store.organizations.find((item) => item._id === id) || null;
      return row;
    },
    async findByIdAndUpdate(id, update) {
      const row = store.organizations.find((item) => item._id === id) || null;
      if (row) Object.assign(row, update);
      return row;
    },
  };

  const OrganizationMembership = {
    ORGANIZATION_ROLES: ["owner", "admin", "manager", "developer", "support", "finance", "viewer"],
    async create(data) {
      const doc = makeDoc({ _id: `mem_${store.memberships.length + 1}`, status: "active", ...data });
      store.memberships.push(doc);
      return doc;
    },
    findOne(filter = {}) {
      const row = store.memberships.find((item) =>
        (!filter.organizationId || item.organizationId === filter.organizationId) &&
        (!filter.userId || item.userId === filter.userId) &&
        (filter.status === undefined || (filter.status?.$ne ? item.status !== filter.status.$ne : item.status === filter.status))
      ) || null;
      return chain(row);
    },
    async findOneAndUpdate(filter, update) {
      let row = store.memberships.find((item) => item.organizationId === filter.organizationId && item.userId === filter.userId);
      if (!row) {
        row = makeDoc({ _id: `mem_${store.memberships.length + 1}` });
        store.memberships.push(row);
      }
      Object.assign(row, update);
      return row;
    },
    find(filter = {}) {
      let rows = store.memberships.filter((item) =>
        (!filter.organizationId || item.organizationId === filter.organizationId) &&
        (!filter.userId || item.userId === filter.userId) &&
        (filter.status === undefined || (filter.status?.$ne ? item.status !== filter.status.$ne : item.status === filter.status))
      );
      return chain(rows.map((row) => ({ ...row, organizationId: store.organizations.find((org) => org._id === row.organizationId) || row.organizationId, userId: store.users.find((user) => user._id === row.userId) || row.userId })));
    },
  };

  const OrganizationInvitation = {
    generateInvitationToken: () => `token_${store.invitations.length + 1}`,
    hashInvitationToken: (token) => `hash_${token}`,
    async create(data) {
      const doc = makeDoc({ _id: `inv_${store.invitations.length + 1}`, status: "pending", ...data });
      store.invitations.push(doc);
      return doc;
    },
    findOne(filter = {}) {
      const row = store.invitations.find((item) =>
        (!filter._id || item._id === filter._id) &&
        (!filter.organizationId || item.organizationId === filter.organizationId) &&
        (!filter.email || item.email === filter.email) &&
        (!filter.status || item.status === filter.status) &&
        (!filter.tokenHash || item.tokenHash === filter.tokenHash)
      ) || null;
      return chain(row);
    },
    find(filter = {}) {
      const rows = store.invitations.filter((item) =>
        (!filter.organizationId || item.organizationId === filter.organizationId) &&
        (!filter.status || item.status === filter.status)
      );
      return chain(rows);
    },
  };

  const User = {
    async findByIdAndUpdate(id, update) {
      const row = store.users.find((item) => item._id === id);
      if (row) Object.assign(row, update);
      return row || null;
    },
  };

  const countModel = (key) => ({ countDocuments: async () => store.counts[key] });

  setMock("src/models/Organization.js", Organization);
  setMock("src/models/OrganizationMembership.js", OrganizationMembership);
  setMock("src/models/OrganizationInvitation.js", OrganizationInvitation);
  setMock("src/models/User.js", User);
  setMock("src/models/License.js", countModel("licenses"));
  setMock("src/models/Order.js", countModel("orders"));
  setMock("src/models/Download.js", countModel("downloads"));
  setMock("src/models/LicenseSite.js", countModel("domains"));
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    service: require(path.join(root, "src/services/organizationService.js")),
    middleware: require(path.join(root, "src/middleware/organizationContext.js")),
  };
}

async function testOrganizationCreationAndSwitching() {
  const { service, store } = loadOrganizationsWithMocks();
  const actor = store.users[0];
  const org = await service.createOrganization({ name: "Acme Inc", billingEmail: "billing@example.test" }, { actor });
  assert.strictEqual(org.slug, "acme-inc");
  assert.strictEqual(store.memberships[0].role, "owner");
  assert.strictEqual(store.users[0].activeOrganizationId, org._id);
  const switched = await service.switchOrganization(actor._id, org._id, { actor });
  assert.strictEqual(switched.membership.role, "owner");
}

async function testInvitationsAndMembership() {
  const { service, store } = loadOrganizationsWithMocks();
  const owner = store.users[0];
  const dev = store.users[1];
  const org = await service.createOrganization({ name: "Team" }, { actor: owner });
  const result = await service.inviteMember(org._id, { email: dev.email, role: "developer" }, { actor: owner });
  assert.ok(result.token.startsWith("token_"));
  const membership = await service.acceptInvitation(result.token, dev, { actor: dev });
  assert.strictEqual(membership.role, "developer");
  assert.strictEqual(store.invitations[0].status, "accepted");
  assert.ok(store.audits.some((entry) => entry.action === "organization.invitation_accepted"));
}

async function testRoleChangesAndOwnershipTransfer() {
  const { service, store } = loadOrganizationsWithMocks();
  const owner = store.users[0];
  const dev = store.users[1];
  const org = await service.createOrganization({ name: "Role Org" }, { actor: owner });
  await service.inviteMember(org._id, { email: dev.email, role: "developer" }, { actor: owner });
  await service.acceptInvitation("token_1", dev, { actor: dev });
  const changed = await service.changeMemberRole(org._id, dev._id, "admin", { actor: owner });
  assert.strictEqual(changed.membership.role, "admin");
  const transferred = await service.transferOwnership(org._id, dev._id, { actor: owner });
  assert.strictEqual(transferred.ownerId, dev._id);
  assert.strictEqual(store.memberships.find((m) => m.userId === owner._id).role, "admin");
  assert.strictEqual(store.memberships.find((m) => m.userId === dev._id).role, "owner");
}

async function testCrossTenantAccessAndSwitchingDenied() {
  const { service, store, middleware } = loadOrganizationsWithMocks();
  const owner = store.users[0];
  const outside = store.users[2];
  const org = await service.createOrganization({ name: "Private Org" }, { actor: owner });
  await assert.rejects(() => service.switchOrganization(outside._id, org._id, { actor: outside }), (err) => err.code === "ORG_ACCESS_DENIED");

  const req = { user: outside, headers: { "x-organization-id": org._id }, query: {} };
  let error = null;
  await middleware.attachOrganizationContext(req, {}, (err) => { error = err; });
  assert.strictEqual(error.code, "ORG_ACCESS_DENIED");
}

async function testDashboardAndMemberLifecycle() {
  const { service, store } = loadOrganizationsWithMocks();
  const owner = store.users[0];
  const dev = store.users[1];
  const org = await service.createOrganization({ name: "Dash Org" }, { actor: owner });
  await service.inviteMember(org._id, { email: dev.email, role: "viewer" }, { actor: owner });
  await service.acceptInvitation("token_1", dev, { actor: dev });
  const dash = await service.dashboard(org._id, { actor: owner });
  assert.strictEqual(dash.summary.licenses, 2);
  assert.strictEqual(dash.summary.members, 2);
  await service.suspendMember(org._id, dev._id, { actor: owner });
  assert.strictEqual(store.memberships.find((m) => m.userId === dev._id).status, "suspended");
  await service.removeMember(org._id, dev._id, { actor: owner });
  assert.strictEqual(store.memberships.find((m) => m.userId === dev._id).status, "removed");
}

async function run() {
  const tests = [
    testOrganizationCreationAndSwitching,
    testInvitationsAndMembership,
    testRoleChangesAndOwnershipTransfer,
    testCrossTenantAccessAndSwitchingDenied,
    testDashboardAndMemberLifecycle,
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
