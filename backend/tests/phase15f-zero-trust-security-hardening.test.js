process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_phase15f_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "phase15f_access_secret_minimum_32_chars";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "phase15f_refresh_secret_minimum_32_chars";
process.env.REDIS_ENABLED = "false";

const assert = require("assert");
const mongoose = require("mongoose");

const Policy = require("../src/services/security/PolicyEngine");
const Risk = require("../src/services/security/RiskEvaluationService");
const Decisions = require("../src/services/security/SecurityDecisionEngine");
const Secrets = require("../src/services/security/SecretManagementService");
const Sessions = require("../src/services/security/SessionSecurityService");
const Dependencies = require("../src/services/security/DependencySecurityService");
const Runtime = require("../src/services/security/RuntimeProtectionService");
const Compliance = require("../src/services/security/SecurityComplianceService");
const ZeroTrust = require("../src/services/security/ZeroTrustManager");

function mockReq(overrides = {}) {
  return {
    id: "req_15f",
    ip: "127.0.0.1",
    method: "GET",
    path: "/api/v1/admin/security",
    originalUrl: "/api/v1/admin/security/dashboard",
    headers: { "user-agent": "phase15f-test" },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    ...overrides,
  };
}

function reset() {
  Policy.resetForTests();
  Sessions.resetForTests();
  Runtime.resetForTests();
}

function testPolicyEngineAndDecision() {
  const apiPolicy = Policy.resolve({ scope: "api", organizationId: "org_1", role: "admin" });
  assert.strictEqual(apiPolicy.rateLimiting, true);
  Policy.updatePolicy("api", { maxRiskScore: 40 });
  const decision = Decisions.decideRequest(mockReq({ user: { role: "admin", organizationId: "org_1" } }));
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.enforcementMode, "monitor");
}

function testRiskAndRuntimeDetection() {
  const request = mockReq({ id: "", headers: {}, user: null });
  const risk = Risk.evaluateRequest(request);
  assert.ok(risk.score >= 10);
  const decision = Decisions.decideRequest(request);
  Runtime.inspectRequest(request, decision);
  const snapshot = Runtime.snapshot();
  assert.ok(snapshot.total >= 1);
}

function testSecretsAndDependencies() {
  const secretSummary = Secrets.summary();
  assert.ok(secretSummary.total >= 5);
  assert.ok(secretSummary.secrets.every((secret) => secret.value === "[REDACTED]"));
  const dependencyHealth = Dependencies.analyze();
  assert.ok(dependencyHealth.total > 0);
  assert.ok(["tracked", "review"].includes(dependencyHealth.dependencyHealth));
}

function testSessionSecurity() {
  const session = {
    sessionId: "sess_15f",
    createdAt: new Date().toISOString(),
    loginAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  assert.strictEqual(Sessions.validateSession(session).valid, true);
  Sessions.revoke("sess_15f");
  assert.strictEqual(Sessions.validateSession(session).valid, false);
  assert.strictEqual(Sessions.isRevoked("sess_15f"), true);
}

async function testZeroTrustDashboard() {
  const dashboard = await ZeroTrust.dashboard();
  assert.ok(dashboard.securityScore >= 0);
  assert.ok(dashboard.policyStatus.length >= 4);
  assert.ok(dashboard.secretHealth);
  assert.ok(dashboard.dependencyHealth);
  assert.strictEqual(dashboard.zeroTrust.vendorNeutral, true);
  const compliance = Compliance.snapshot();
  assert.strictEqual(compliance.compliance.secretsExposed, false);
}

async function run() {
  reset();
  testPolicyEngineAndDecision();
  testRiskAndRuntimeDetection();
  testSecretsAndDependencies();
  testSessionSecurity();
  await testZeroTrustDashboard();
  await mongoose.disconnect().catch(() => {});
  console.log("Phase 15F zero trust security hardening tests passed.");
}

run().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error(err);
  process.exit(1);
});
