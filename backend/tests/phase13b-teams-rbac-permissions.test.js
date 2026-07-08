const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase13b_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase13b_test_refresh_secret_with_enough_entropy";

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
  return { ...data, async save() { return this; } };
}

function chain(value) {
  return {
    sort() { return this; },
    populate() { return this; },
    lean: async () => Array.isArray(value) ? value.map((item) => ({ ...item })) : (value ? { ...value } : value),
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "_id" && value?.$in) return value.$in.map(String).includes(String(row._id));
    if (value?.$ne !== undefined) return row[key] !== value.$ne;
    return String(row[key]) === String(value);
  });
}

function loadRbacWithMocks() {
  const store = {
    orgs: [{ _id: "607f1f77bcf86cd799439001", status: "active", ownerId: "507f1f77bcf86cd799439001", name: "Acme" }],
    memberships: [
      doc({ _id: "mem_owner", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439001", role: "owner", status: "active", teamIds: [], roleIds: [], permissionOverrides: { allow: [], deny: [] } }),
      doc({ _id: "mem_dev", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439002", role: "developer", status: "active", teamIds: [], roleIds: [], permissionOverrides: { allow: [], deny: [] } }),
      doc({ _id: "mem_viewer", organizationId: "607f1f77bcf86cd799439001", userId: "507f1f77bcf86cd799439003", role: "viewer", status: "active", teamIds: [], roleIds: [], permissionOverrides: { allow: [], deny: [] } }),
    ],
    teams: [],
    roles: [],
    audits: [],
  };

  [
    "src/models/Organization.js",
    "src/models/OrganizationMembership.js",
    "src/models/OrganizationInvitation.js",
    "src/models/OrganizationTeam.js",
    "src/models/OrganizationRole.js",
    "src/models/User.js",
    "src/models/License.js",
    "src/models/Order.js",
    "src/models/Download.js",
    "src/models/LicenseSite.js",
    "src/utils/auditLog.js",
    "src/services/organizationService.js",
    "src/services/rbac/PermissionRegistry.js",
    "src/services/rbac/PermissionCache.js",
    "src/services/rbac/PermissionResolver.js",
    "src/services/rbac/RbacService.js",
    "src/middleware/permissionMiddleware.js",
  ].forEach(clearModule);

  const Organization = {
    async findById(id) { return store.orgs.find((org) => org._id === id) || null; },
  };

  const Membership = {
    async create(data) { const item = doc({ _id: `mem_${store.memberships.length + 1}`, ...data }); store.memberships.push(item); return item; },
    findOne(filter = {}) { return chain(store.memberships.find((row) => matches(row, filter)) || null); },
    find(filter = {}) { return chain(store.memberships.filter((row) => matches(row, filter))); },
    async updateMany(filter, update) {
      store.memberships.filter((row) => matches(row, filter)).forEach((row) => {
        if (update.$pull?.teamIds) row.teamIds = row.teamIds.filter((id) => String(id) !== String(update.$pull.teamIds));
        if (update.$pull?.roleIds) row.roleIds = row.roleIds.filter((id) => String(id) !== String(update.$pull.roleIds));
      });
    },
  };

  const Team = {
    DEFAULT_TEAMS: ["Engineering", "Finance", "Support", "Sales", "Marketing", "QA", "Operations"],
    async create(data) { const item = doc({ _id: `team_${store.teams.length + 1}`, slug: String(data.name).toLowerCase(), status: "active", memberIds: [], roleIds: [], ...data }); store.teams.push(item); return item; },
    findOne(filter = {}) { return chain(store.teams.find((row) => matches(row, filter)) || null); },
    find(filter = {}) { return chain(store.teams.filter((row) => matches(row, filter))); },
    async updateMany(filter, update) {
      store.teams.filter((row) => matches(row, filter)).forEach((row) => {
        if (update.$pull?.roleIds) row.roleIds = row.roleIds.filter((id) => String(id) !== String(update.$pull.roleIds));
      });
    },
  };

  const Role = {
    async create(data) { const item = doc({ _id: `role_${store.roles.length + 1}`, slug: String(data.name).toLowerCase(), status: "active", ...data }); store.roles.push(item); return item; },
    findOne(filter = {}) { return chain(store.roles.find((row) => matches(row, filter)) || null); },
    find(filter = {}) { return chain(store.roles.filter((row) => matches(row, filter))); },
  };

  setMock("src/models/Organization.js", Organization);
  setMock("src/models/OrganizationMembership.js", Membership);
  setMock("src/models/OrganizationInvitation.js", {});
  setMock("src/models/OrganizationTeam.js", Team);
  setMock("src/models/OrganizationRole.js", Role);
  setMock("src/models/User.js", { findByIdAndUpdate: async () => null });
  setMock("src/models/License.js", { countDocuments: async () => 0 });
  setMock("src/models/Order.js", { countDocuments: async () => 0 });
  setMock("src/models/Download.js", { countDocuments: async () => 0 });
  setMock("src/models/LicenseSite.js", { countDocuments: async () => 0 });
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    service: require(path.join(root, "src/services/rbac/RbacService.js")),
    resolver: require(path.join(root, "src/services/rbac/PermissionResolver.js")),
    middleware: require(path.join(root, "src/middleware/permissionMiddleware.js")),
    registry: require(path.join(root, "src/services/rbac/PermissionRegistry.js")),
  };
}

async function testRoleCreationAndPermissionResolution() {
  const { service, resolver, store } = loadRbacWithMocks();
  const actor = { _id: "507f1f77bcf86cd799439001" };
  const org = "607f1f77bcf86cd799439001";
  const role = await service.createRole(org, { name: "Download Manager", permissions: ["downloads.manage", "downloads.export"] }, { actor });
  await service.assignRoleToMember(org, "507f1f77bcf86cd799439002", role._id, { actor });
  const resolved = await resolver.resolve("507f1f77bcf86cd799439002", org, { skipCache: true });
  assert.ok(resolved.permissions.includes("downloads.manage"));
  assert.ok(store.audits.some((entry) => entry.action === "rbac.role_created"));
}

async function testTeamAssignmentAndInheritedRole() {
  const { service, resolver } = loadRbacWithMocks();
  const actor = { _id: "507f1f77bcf86cd799439001" };
  const org = "607f1f77bcf86cd799439001";
  const role = await service.createRole(org, { name: "Finance Export", permissions: ["payments.export"] }, { actor });
  const team = await service.createTeam(org, { name: "Finance Team", roleIds: [role._id] }, { actor });
  await service.assignTeamMember(org, team._id, "507f1f77bcf86cd799439002", { actor });
  const resolved = await resolver.resolve("507f1f77bcf86cd799439002", org, { skipCache: true });
  assert.ok(resolved.permissions.includes("payments.export"));
}

async function testPermissionMiddleware() {
  const { service, middleware } = loadRbacWithMocks();
  const actor = { _id: "507f1f77bcf86cd799439001" };
  const org = "607f1f77bcf86cd799439001";
  const role = await service.createRole(org, { name: "Analytics", permissions: ["analytics.export"] }, { actor });
  await service.assignRoleToMember(org, "507f1f77bcf86cd799439002", role._id, { actor });
  let allowed = false;
  await middleware.requirePermission("analytics.export")({ user: { _id: "507f1f77bcf86cd799439002" }, params: { organizationId: org }, headers: {} }, {}, (err) => { if (err) throw err; allowed = true; });
  assert.strictEqual(allowed, true);

  let denied = null;
  await middleware.requirePermission("settings.manage")({ user: { _id: "507f1f77bcf86cd799439002" }, params: { organizationId: org }, headers: {} }, {}, (err) => { denied = err; });
  assert.strictEqual(denied.statusCode, 403);
}

async function testPrivilegeEscalationPrevention() {
  const { service } = loadRbacWithMocks();
  const org = "607f1f77bcf86cd799439001";
  await assert.rejects(
    () => service.createRole(org, { name: "Escalate", permissions: ["settings.manage"] }, { actor: { _id: "507f1f77bcf86cd799439002" } }),
    (err) => err.code === "RBAC_MANAGE_REQUIRED"
  );
}

async function testRoleArchiveAndTeamDeleteCleanup() {
  const { service, store } = loadRbacWithMocks();
  const actor = { _id: "507f1f77bcf86cd799439001" };
  const org = "607f1f77bcf86cd799439001";
  const role = await service.createRole(org, { name: "Support Read", permissions: ["licenses.read"] }, { actor });
  const team = await service.createTeam(org, { name: "Support Triage", roleIds: [role._id] }, { actor });
  await service.assignTeamMember(org, team._id, "507f1f77bcf86cd799439002", { actor });
  await service.deleteTeam(org, team._id, { actor });
  assert.strictEqual(store.teams[0].status, "deleted");
  assert.deepStrictEqual(store.memberships.find((item) => item.userId === "507f1f77bcf86cd799439002").teamIds, []);
  await service.archiveRole(org, role._id, { actor });
  assert.strictEqual(store.roles[0].status, "archived");
}

async function run() {
  const tests = [
    testRoleCreationAndPermissionResolution,
    testTeamAssignmentAndInheritedRole,
    testPermissionMiddleware,
    testPrivilegeEscalationPrevention,
    testRoleArchiveAndTeamDeleteCleanup,
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
