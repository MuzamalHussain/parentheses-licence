const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase12e_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase12e_test_refresh_secret_with_enough_entropy";

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
    async save() {
      return this;
    },
  };
}

function attachSave(row) {
  row.save = async function save() {
    return this;
  };
  return row;
}

function dosTimeDate() {
  return { time: 0, date: 0 };
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.contents || "");
    const { time, date } = dosTimeDate();
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function writePluginZip(version = "1.2.3") {
  const filePath = path.join(os.tmpdir(), `phase12e-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(filePath, makeZip([
    { name: "parentheses/" },
    { name: "parentheses/parentheses.php", contents: `<?php\n/**\n * Plugin Name: Parentheses\n * Version: ${version}\n */\n` },
    { name: "parentheses/readme.txt", contents: "=== Parentheses ===" },
  ]));
  return filePath;
}

function loadReleaseAutomationWithMocks() {
  const store = {
    products: [{ _id: "prod_1", name: "Parentheses", slug: "parentheses", pluginSlug: "parentheses", stableBranch: "main" }],
    repositories: [],
    pipelines: [],
    versions: [],
    audits: [],
  };

  [
    "src/models/Product.js",
    "src/models/PluginVersion.js",
    "src/models/ReleaseRepository.js",
    "src/models/ReleasePipeline.js",
    "src/utils/auditLog.js",
    "src/services/releaseAutomation/GitHubReleaseProvider.js",
    "src/services/releaseAutomation/ReleaseValidationService.js",
    "src/services/releaseAutomation/ReleaseAutomationService.js",
  ].forEach(clearModule);

  const Product = {
    async findById(id) {
      const row = store.products.find((item) => item._id === id);
      return row ? makeDoc(row) : null;
    },
  };

  const ReleaseRepository = {
    async findOneAndUpdate(filter, update) {
      let row = store.repositories.find((item) => item.provider === filter.provider && item.owner === filter.owner && item.repo === filter.repo);
      if (!row) {
        row = attachSave({ _id: `repo_${store.repositories.length + 1}` });
        store.repositories.push(row);
      }
      Object.assign(row, update.$set || {});
      return makeDoc(row);
    },
    async findById(id) {
      const row = store.repositories.find((item) => item._id === id);
      return row || null;
    },
    find(filter = {}) {
      let rows = [...store.repositories];
      if (filter.productId) rows = rows.filter((item) => item.productId === filter.productId);
      return { sort: () => ({ limit: () => ({ lean: async () => rows.map((item) => ({ ...item })) }) }) };
    },
  };

  const ReleasePipeline = {
    async create(data) {
      const row = attachSave({ _id: `pipe_${store.pipelines.length + 1}`, ...data });
      store.pipelines.push(row);
      return row;
    },
    async findOne(filter) {
      return store.pipelines.find((item) => item.productId === filter.productId && item.releaseTag === filter.releaseTag) || null;
    },
    async findById(id) {
      const row = store.pipelines.find((item) => item._id === id);
      return row || null;
    },
    find(filter = {}) {
      let rows = [...store.pipelines];
      if (filter.productId) rows = rows.filter((item) => item.productId === filter.productId);
      if (filter.status) rows = rows.filter((item) => item.status === filter.status);
      return {
        sort: () => ({
          limit: () => ({
            populate: () => ({ lean: async () => rows.map((item) => ({ ...item, productId: store.products[0] })) }),
          }),
        }),
      };
    },
  };

  const PluginVersion = {
    async create(data) {
      const row = attachSave({ _id: `ver_${store.versions.length + 1}`, ...data });
      store.versions.push(row);
      return row;
    },
    async findOne(filter) {
      return store.versions.find((item) => item.productId === filter.productId && item.versionNumber === filter.versionNumber) || null;
    },
  };

  setMock("src/models/Product.js", Product);
  setMock("src/models/PluginVersion.js", PluginVersion);
  setMock("src/models/ReleaseRepository.js", ReleaseRepository);
  setMock("src/models/ReleasePipeline.js", ReleasePipeline);
  setMock("src/utils/auditLog.js", { writeAuditLog: async (entry) => store.audits.push(entry) });

  return {
    store,
    service: require(path.join(root, "src/services/releaseAutomation/ReleaseAutomationService.js")),
  };
}

async function testRepositoryConnectionAndHealth() {
  const { service, store } = loadReleaseAutomationWithMocks();
  const repo = await service.connectRepository({
    productId: "prod_1",
    repositoryUrl: "https://github.com/parentheses/licence",
    defaultBranch: "main",
  }, { actor: { _id: "admin_1", role: "admin" } });
  assert.strictEqual(repo.owner, "parentheses");
  assert.strictEqual(repo.repo, "licence");
  assert.strictEqual(repo.status, "connected");
  const checked = await service.repositoryHealth(repo._id);
  assert.strictEqual(checked.health.status, "ok");
  assert.ok(store.audits.some((entry) => entry.action === "release_repository.connected"));
}

async function testReleaseImportAndZipValidationCreatesDraftVersion() {
  const { service, store } = loadReleaseAutomationWithMocks();
  const repo = await service.connectRepository({ productId: "prod_1", owner: "parentheses", repo: "licence" });
  const zipPath = writePluginZip("1.2.3");
  try {
    const pipeline = await service.importRelease(repo._id, {
      tag_name: "v1.2.3",
      name: "Release 1.2.3",
      body: "Changelog",
      target_commitish: "abc123def456",
      assetPath: zipPath,
      asset: { id: "asset_1" },
    });
    assert.strictEqual(pipeline.status, "validated");
    assert.strictEqual(pipeline.validationStatus, "passed");
    assert.strictEqual(store.versions.length, 1);
    assert.strictEqual(store.versions[0].status, "draft");
    assert.strictEqual(store.versions[0].releaseChannel, "stable");
    assert.strictEqual(store.versions[0].buildMetadata.commitSha, "abc123def456");
    assert.ok(store.versions[0].checksum.length === 64);
  } finally {
    fs.unlinkSync(zipPath);
  }
}

async function testInvalidArtifactBlocksPipelineReadiness() {
  const { service, store } = loadReleaseAutomationWithMocks();
  const repo = await service.connectRepository({ productId: "prod_1", owner: "parentheses", repo: "licence" });
  const pipeline = await service.importRelease(repo._id, {
    tag_name: "v1.2.4-beta.1",
    prerelease: true,
    assetPath: path.join(os.tmpdir(), "missing-phase12e.zip"),
  });
  assert.strictEqual(pipeline.status, "draft");
  assert.strictEqual(pipeline.validationStatus, "failed");
  assert.strictEqual(pipeline.releaseChannel, "beta");
  assert.strictEqual(store.versions.length, 0);
  assert.ok(store.audits.some((entry) => entry.action === "release_validation.failed"));
}

async function testPipelineStateTransitionsAndDuplicateProtection() {
  const { service } = loadReleaseAutomationWithMocks();
  const repo = await service.connectRepository({ productId: "prod_1", owner: "parentheses", repo: "licence" });
  const zipPath = writePluginZip("2.0.0");
  try {
    const pipeline = await service.importRelease(repo._id, { tag_name: "v2.0.0", assetPath: zipPath });
    const ready = await service.setPipelineStatus(pipeline._id, "ready");
    assert.strictEqual(ready.status, "ready");
    const published = await service.setPipelineStatus(pipeline._id, "published");
    assert.strictEqual(published.status, "published");
    await assert.rejects(
      () => service.importRelease(repo._id, { tag_name: "v2.0.0" }),
      (err) => err.statusCode === 409
    );
  } finally {
    fs.unlinkSync(zipPath);
  }
}

function testPermissions() {
  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

async function run() {
  const tests = [
    testRepositoryConnectionAndHealth,
    testReleaseImportAndZipValidationCreatesDraftVersion,
    testInvalidArtifactBlocksPipelineReadiness,
    testPipelineStateTransitionsAndDuplicateProtection,
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
