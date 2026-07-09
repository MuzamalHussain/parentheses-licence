const Policy = require("./PolicyEngine");
const Decisions = require("./SecurityDecisionEngine");
const Runtime = require("./RuntimeProtectionService");
const Compliance = require("./SecurityComplianceService");
const Secrets = require("./SecretManagementService");
const Dependencies = require("./DependencySecurityService");
const Sessions = require("./SessionSecurityService");
const { writeAuditLog } = require("../../utils/auditLog");

function middleware(req, res, next) {
  const decision = Decisions.decideRequest(req);
  req.securityDecision = decision;
  res.setHeader("X-Zero-Trust-Decision", decision.decision);
  Runtime.inspectRequest(req, decision);
  next();
}

async function updatePolicy(scope, patch = {}, context = {}) {
  const policy = Policy.updatePolicy(scope, patch);
  await writeAuditLog({
    actor: context.actor,
    action: "security.policy_updated",
    targetType: "SecurityPolicy",
    targetId: scope,
    metadata: { scope, keys: Object.keys(patch || {}) },
    ip: context.ip,
    requestId: context.requestId,
  });
  return policy;
}

async function dashboard() {
  const compliance = Compliance.snapshot();
  return {
    generatedAt: new Date().toISOString(),
    securityScore: compliance.securityScore,
    threatSummary: compliance.runtimeAlerts,
    policyStatus: compliance.policyStatus,
    secretHealth: compliance.secretHealth,
    dependencyHealth: compliance.dependencyHealth,
    runtimeProtection: compliance.runtimeAlerts,
    sessionSecurity: compliance.sessionSecurity,
    apiSecurity: Policy.resolve({ scope: "api" }),
    aiSecurity: Policy.resolve({ scope: "ai" }),
    deploymentSecurity: Policy.resolve({ scope: "deployment" }),
    zeroTrust: {
      identityVerification: true,
      continuousRiskEvaluation: true,
      leastPrivilege: true,
      assumeBreach: true,
      vendorNeutral: true,
    },
  };
}

module.exports = {
  dashboard,
  dependencyHealth: Dependencies.analyze,
  middleware,
  revokeSession: Sessions.revoke,
  secretHealth: Secrets.summary,
  updatePolicy,
};
