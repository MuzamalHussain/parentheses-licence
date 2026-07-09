const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase14e_test_access_secret_with_enough_entropy";
process.env.AI_SETTINGS_SECRET = "phase14e_ai_secret_with_enough_entropy";

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

function doc(data, list) {
  return {
    ...data,
    toObject() { return { ...this }; },
    async save() {
      if (list && !list.find((item) => item._id === this._id)) list.push(this);
      return this;
    },
  };
}

function getValue(row, key) {
  return key.split(".").reduce((value, part) => value?.[part], row);
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((inner) => matches(row, inner));
    const actual = getValue(row, key);
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(actual));
    if (value && typeof value === "object" && "$gte" in value) {
      const date = new Date(actual);
      return date >= value.$gte && (!value.$lte || date <= value.$lte);
    }
    if (value && typeof value === "object" && "$lte" in value) return new Date(actual) <= value.$lte;
    if (key === "_id") return String(row._id) === String(value);
    return value === undefined || String(actual) === String(value);
  });
}

function chain(value) {
  const api = {
    select() { return api; },
    sort() { return api; },
    limit() { return api; },
    lean: async () => value,
    catch: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return api;
}

function model(list, prefix) {
  function Model(input) {
    return doc({ _id: `${prefix}_${list.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input }, list);
  }
  Model.find = (filter = {}) => chain(list.filter((row) => matches(row, filter)));
  Model.findOne = (filter = {}) => chain(list.find((row) => matches(row, filter)) || null);
  Model.findById = (id) => chain(list.find((row) => String(row._id) === String(id)) || null);
  Model.findOneAndUpdate = async (filter, patch, options = {}) => {
    let row = list.find((item) => matches(item, filter));
    if (!row && options.upsert) {
      row = Model({ ...filter, ...(patch.$set || patch) });
      list.push(row);
      return row;
    }
    if (row) Object.assign(row, patch.$set || patch);
    return row;
  };
  Model.create = async (input) => {
    const row = Model(input);
    list.push(row);
    return row;
  };
  return Model;
}

function loadAIWorkflowsWithMocks() {
  const store = {
    approvals: [],
    policies: [],
    orders: [
      doc({ _id: "ord_1", organizationId: "org_1", status: "failed", paymentStatus: "failed", userId: "user_1", createdAt: new Date() }),
    ],
    licenses: [
      doc({ _id: "lic_1", organizationId: "org_1", status: "active", userId: "user_1", expiresAt: new Date(Date.now() + 7 * 86400000) }),
    ],
    tickets: [
      doc({ _id: "ticket_1", organizationId: "org_1", status: "open", subject: "Help", userId: "user_1" }),
    ],
    risks: [
      doc({ _id: "risk_1", organizationId: "org_1", riskLevel: "high", status: "open", score: 80, entityType: "license", entityId: "lic_1" }),
    ],
    audits: [],
    dispatched: [],
  };

  [
    "src/services/aiWorkflow/AIWorkflowTemplates.js",
    "src/services/aiWorkflow/AIWorkflowPolicyService.js",
    "src/services/aiWorkflow/AIWorkflowPlanner.js",
    "src/services/aiWorkflow/AIApprovalQueue.js",
    "src/services/aiWorkflow/AIExecutionCoordinator.js",
    "src/services/aiWorkflow/AIWorkflowManager.js",
    "src/models/AIWorkflowApproval.js",
    "src/models/AIWorkflowPolicy.js",
    "src/models/Order.js",
    "src/models/License.js",
    "src/models/SupportTicket.js",
    "src/models/AIFraudRisk.js",
    "src/services/ai/AIPermissionService.js",
    "src/services/ai/AIAuditService.js",
    "src/services/workflows/WorkflowEngine.js",
  ].forEach(clearModule);

  setMock("src/models/AIWorkflowApproval.js", model(store.approvals, "approval"));
  setMock("src/models/AIWorkflowPolicy.js", model(store.policies, "policy"));
  setMock("src/models/Order.js", model(store.orders, "order"));
  setMock("src/models/License.js", model(store.licenses, "license"));
  setMock("src/models/SupportTicket.js", model(store.tickets, "ticket"));
  setMock("src/models/AIFraudRisk.js", model(store.risks, "risk"));
  setMock("src/services/ai/AIPermissionService.js", {
    assert: async (actor, organizationId, permission) => {
      if (actor?.role === "admin") return true;
      if (organizationId !== actor?.activeOrganizationId || permission !== "ai.workflow.manage") {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }
      return true;
    },
  });
  setMock("src/services/ai/AIAuditService.js", { record: async (action, entry) => store.audits.push({ action, entry }) });
  setMock("src/services/workflows/WorkflowEngine.js", {
    dispatch: async (eventName, payload, options) => {
      const result = { success: true, eventName, payload, options };
      store.dispatched.push(result);
      return result;
    },
  });

  return {
    store,
    manager: require(path.join(root, "src/services/aiWorkflow/AIWorkflowManager.js")),
    policy: require(path.join(root, "src/services/aiWorkflow/AIWorkflowPolicyService.js")),
    planner: require(path.join(root, "src/services/aiWorkflow/AIWorkflowPlanner.js")),
    coordinator: require(path.join(root, "src/services/aiWorkflow/AIExecutionCoordinator.js")),
  };
}

async function testWorkflowPlanning() {
  const { manager, store } = loadAIWorkflowsWithMocks();
  const result = await manager.plan({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1" }, { ip: "127.0.0.1" });
  assert.ok(result.planned.length >= 4);
  assert.ok(store.approvals.some((item) => item.templateKey === "payment_recovery"));
  assert.ok(store.audits.some((entry) => entry.action === "ai.workflow_suggested"));
}

async function testApprovalQueueTransitions() {
  const { manager, store } = loadAIWorkflowsWithMocks();
  await manager.plan({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1" });
  const approval = store.approvals[0];
  await manager.approve({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, id: approval._id });
  assert.strictEqual(approval.status, "approved");
  await manager.execute({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, id: approval._id });
  assert.strictEqual(approval.status, "executed");
  assert.strictEqual(store.dispatched.length, 1);
}

async function testPolicyEnforcementBlocksUnapprovedExecution() {
  const { manager, store } = loadAIWorkflowsWithMocks();
  await manager.plan({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1" });
  const approval = store.approvals.find((item) => item.mode === "approval_required");
  await assert.rejects(
    () => manager.execute({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, id: approval._id }),
    (err) => err.statusCode === 403
  );
}

async function testAutomaticPolicyCanExecuteSafePlan() {
  const { manager, store } = loadAIWorkflowsWithMocks();
  await manager.updatePolicy({
    actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" },
    input: { organizationId: "org_1", category: "renewals", mode: "automatic_execution", maxAutomaticRiskLevel: "low" },
  });
  await manager.plan({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, organizationId: "org_1" });
  const renewal = store.approvals.find((item) => item.templateKey === "license_renewal");
  await manager.execute({ actor: { _id: "admin_1", role: "admin", activeOrganizationId: "org_1" }, id: renewal._id });
  assert.strictEqual(renewal.status, "executed");
  assert.ok(store.audits.some((entry) => entry.action === "ai.workflow_policy_changed"));
}

async function testPermissionIsolation() {
  const { manager } = loadAIWorkflowsWithMocks();
  await assert.rejects(
    () => manager.plan({ actor: { _id: "user_1", role: "customer", activeOrganizationId: "org_1" }, organizationId: "org_2" }),
    (err) => err.statusCode === 403
  );
}

async function run() {
  const tests = [
    testWorkflowPlanning,
    testApprovalQueueTransitions,
    testPolicyEnforcementBlocksUnapprovedExecution,
    testAutomaticPolicyCanExecuteSafePlan,
    testPermissionIsolation,
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
