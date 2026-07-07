const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase11b_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase11b_test_refresh_secret_with_enough_entropy";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function makeQuery(items) {
  return {
    sort() { return this; },
    skip() { return this; },
    limit(value) {
      return Promise.resolve(items.slice(0, value));
    },
    lean() {
      return Promise.resolve(items);
    },
    then(resolve, reject) {
      return Promise.resolve(items).then(resolve, reject);
    },
  };
}

function loadWorkflowWithMocks() {
  const store = { jobs: [], audits: [], nextId: 1 };

  for (const relativePath of [
    "src/models/WorkflowJob.js",
    "src/utils/auditLog.js",
    "src/services/workflows/WorkflowContext.js",
    "src/services/workflows/WorkflowRegistry.js",
    "src/services/workflows/WorkflowExecutor.js",
    "src/services/workflows/WorkflowScheduler.js",
    "src/services/workflows/WorkflowEngine.js",
  ]) clearModule(relativePath);

  function attachSave(job) {
    job.save = async () => job;
    return job;
  }

  const WorkflowJob = {
    async create(data) {
      if (data.idempotencyKey && store.jobs.some((job) => job.idempotencyKey === data.idempotencyKey)) {
        const err = new Error("duplicate key");
        err.code = 11000;
        throw err;
      }
      const job = attachSave({ _id: `job_${store.nextId++}`, ...data, createdAt: new Date(), updatedAt: new Date() });
      store.jobs.push(job);
      return job;
    },
    find(filter = {}) {
      let rows = [...store.jobs];
      if (filter.status?.$in) rows = rows.filter((job) => filter.status.$in.includes(job.status));
      else if (filter.status) rows = rows.filter((job) => job.status === filter.status);
      if (filter.eventName) rows = rows.filter((job) => job.eventName === filter.eventName);
      if (filter.workflowName) rows = rows.filter((job) => job.workflowName === filter.workflowName);
      if (filter.nextRunAt?.$lte) rows = rows.filter((job) => new Date(job.nextRunAt) <= filter.nextRunAt.$lte);
      return makeQuery(rows);
    },
    async findById(id) {
      return store.jobs.find((job) => job._id === id) || null;
    },
    async findOneAndUpdate(filter, update) {
      const job = store.jobs.find((candidate) => candidate._id === filter._id && (!filter.status?.$in || filter.status.$in.includes(candidate.status)));
      if (!job) return null;
      Object.assign(job, update.$set || update);
      return job;
    },
    async updateOne(filter, update) {
      const job = store.jobs.find((candidate) => candidate._id === filter._id);
      if (job) Object.assign(job, update.$set || update);
      return { modifiedCount: job ? 1 : 0 };
    },
    aggregate() {
      const counts = store.jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});
      return Promise.resolve(Object.entries(counts).map(([_id, count]) => ({ _id, count })));
    },
    countDocuments(filter = {}) {
      return this.find(filter).then((rows) => rows.length);
    },
  };

  const modelPath = clearModule("src/models/WorkflowJob.js");
  require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: WorkflowJob };

  const auditPath = clearModule("src/utils/auditLog.js");
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {
      writeAuditLog: async (entry) => {
        store.audits.push(entry);
      },
    },
  };

  const engine = require(path.join(root, "src/services/workflows/WorkflowEngine.js"));
  const registry = require(path.join(root, "src/services/workflows/WorkflowRegistry.js"));
  registry.workflows.clear();
  registry.recurring = [];
  return { engine, registry, store };
}

async function testWorkflowExecutionAndEventDispatching() {
  const { engine, registry, store } = loadWorkflowWithMocks();
  let handled = false;
  registry.register({
    name: "test.user.registered",
    eventName: "UserRegistered",
    handler: async (context) => {
      handled = context.get("email") === "ada@example.com";
      return { notified: true };
    },
  });

  const result = await engine.dispatch("UserRegistered", { email: "ada@example.com" }, { idempotencyKey: "user-registered-1" });
  assert.strictEqual(result.matched, 1);
  assert.strictEqual(handled, true);
  assert.strictEqual(store.jobs[0].status, "completed");
  assert.ok(store.audits.some((entry) => entry.action === "workflow.started"));
  assert.ok(store.audits.some((entry) => entry.action === "workflow.completed"));
}

async function testDuplicateWorkflowExecutionIsBlocked() {
  const { engine, registry, store } = loadWorkflowWithMocks();
  registry.register({ name: "test.order.completed", eventName: "OrderCompleted", handler: async () => ({ ok: true }) });

  await engine.dispatch("OrderCompleted", { orderId: "ord_1" }, { idempotencyKey: "order-completed-ord-1" });
  const duplicate = await engine.dispatch("OrderCompleted", { orderId: "ord_1" }, { idempotencyKey: "order-completed-ord-1" });
  assert.strictEqual(store.jobs.length, 1);
  assert.strictEqual(duplicate.results[0].duplicate, true);
}

async function testRetryLogicCompletesDueJob() {
  const { engine, registry, store } = loadWorkflowWithMocks();
  registry.register({
    name: "test.email.retry",
    eventName: "PaymentFailed",
    maxAttempts: 2,
    retryDelayMs: 1,
    handler: async (context) => {
      if ((context.job?.attempts || 0) < 2) throw new Error("email provider unavailable");
      return { sent: true };
    },
  });

  await engine.dispatch("PaymentFailed", { paymentId: "pay_1" });
  assert.strictEqual(store.jobs[0].status, "retrying");
  store.jobs[0].nextRunAt = new Date(Date.now() - 1000);
  const processed = await engine.processDueJobs({ now: new Date() });
  assert.strictEqual(processed.processed, 1);
  assert.strictEqual(store.jobs[0].status, "completed");
  assert.ok(store.audits.some((entry) => entry.action === "workflow.retry_executed"));
}

async function testSchedulerDefersFutureWork() {
  const { engine, registry, store } = loadWorkflowWithMocks();
  registry.register({ name: "test.version.release", eventName: "VersionReleased", handler: async () => ({ indexed: true }) });
  const future = new Date(Date.now() + 60_000);

  await engine.schedule("VersionReleased", { versionId: "ver_1" }, future);
  assert.strictEqual(store.jobs[0].status, "queued");
  assert.strictEqual(store.jobs[0].workflowType, "scheduled");
  const early = await engine.processDueJobs({ now: new Date() });
  assert.strictEqual(early.processed, 0);
  const due = await engine.processDueJobs({ now: new Date(Date.now() + 120_000) });
  assert.strictEqual(due.processed, 1);
  assert.strictEqual(store.jobs[0].status, "completed");
}

async function testStatsAndPermissions() {
  const { engine, registry } = loadWorkflowWithMocks();
  registry.register({ name: "test.download.completed", eventName: "DownloadCompleted", handler: async () => ({ ok: true }) });
  await engine.dispatch("DownloadCompleted", { downloadId: "dl_1" });
  const stats = await engine.stats();
  assert.strictEqual(stats.completed, 1);
  assert.strictEqual(stats.registeredWorkflows, 1);

  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testWorkflowExecutionAndEventDispatching,
    testDuplicateWorkflowExecutionIsBlocked,
    testRetryLogicCompletesDueJob,
    testSchedulerDefersFutureWork,
    testStatsAndPermissions,
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
