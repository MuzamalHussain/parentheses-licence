process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15e_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15e_access_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15e_refresh_secret";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

const Environments = require("../src/services/deployment/DeploymentEnvironmentService");
const Pipeline = require("../src/services/deployment/DeploymentPipeline");
const Approvals = require("../src/services/deployment/DeploymentApprovalService");
const History = require("../src/services/deployment/DeploymentHistoryService");
const Rollback = require("../src/services/deployment/RollbackService");
const Deployment = require("../src/services/deployment/DeploymentManager");
const Health = require("../src/services/deployment/DeploymentHealthVerifier");

function reset() {
  Environments.resetForTests();
  Approvals.resetForTests();
  History.resetForTests();
}

function testEnvironmentConfiguration() {
  const environments = Environments.listEnvironments();
  assert.ok(environments.some((env) => env.id === "production" && env.requiresApproval));
  const config = Environments.currentEnvironmentConfig();
  assert.ok(config.environmentVariables.NODE_ENV);
  assert.ok(config.secretReferences.every((secret) => secret.value === "" || secret.value === "[SECRET_REF]"));
  const updated = Environments.updateEnvironment("staging", { status: "locked" });
  assert.strictEqual(updated.status, "locked");
}

async function testPipelineAndHealth() {
  const result = await Pipeline.run({ deploymentId: "dep_test", environment: "development", version: "1.2.3" });
  assert.ok(result.steps.some((step) => step.step === "build"));
  assert.ok(result.steps.some((step) => step.step === "post_deployment_verification"));
  assert.strictEqual(result.parallelValidationReady, true);
  const health = await Health.verify("development");
  assert.ok(Array.isArray(health.checks));
}

async function testApprovalsPromotionAndDeployment() {
  const pending = await Deployment.startDeployment({
    version: "1.2.3",
    previousVersion: "1.2.2",
    environment: "staging",
    operator: { role: "admin", _id: null },
  });
  assert.strictEqual(pending.approval.status, "pending");
  const approved = await Approvals.decide(pending.approval.id, "approve", { actor: { role: "admin" } });
  assert.strictEqual(approved.status, "approved");
  const completed = await Deployment.completeDeployment(pending.id || pending.approval.deploymentId, { actor: { role: "admin" } });
  assert.ok(["completed", "failed"].includes(completed.status));

  const promotion = await Deployment.promote({
    from: "development",
    to: "testing",
    version: "1.2.4",
    operator: { role: "admin", _id: null },
  });
  assert.deepStrictEqual(promotion.promotionPath, ["development", "testing"]);
}

function testRollbackValidationAndBlueGreen() {
  const deployment = History.list()[0];
  const valid = Rollback.validate({ deploymentId: deployment.id, targetVersion: "1.2.2", rollbackType: "application" });
  assert.strictEqual(valid.valid, true);
  const invalid = Rollback.validate({ deploymentId: "missing", rollbackType: "configuration" });
  assert.strictEqual(invalid.valid, false);
  const foundation = Rollback.blueGreenFoundation("production");
  assert.strictEqual(foundation.liveTrafficSwitchingEnabled, false);
}

async function testDashboardAggregation() {
  const dashboard = await Deployment.dashboard();
  assert.ok(dashboard.environments.length >= 5);
  assert.ok(dashboard.pipeline.length >= 8);
  assert.ok(dashboard.deployments.length >= 1);
  assert.ok(dashboard.health);
  assert.ok(dashboard.blueGreen.length >= 5);
}

async function run() {
  reset();
  testEnvironmentConfiguration();
  await testPipelineAndHealth();
  await testApprovalsPromotionAndDeployment();
  testRollbackValidationAndBlueGreen();
  await testDashboardAggregation();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15E enterprise DevOps deployment platform tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
