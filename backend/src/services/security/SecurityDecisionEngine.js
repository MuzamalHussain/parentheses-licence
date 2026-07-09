const PolicyEngine = require("./PolicyEngine");
const Risk = require("./RiskEvaluationService");

function decideRequest(req, { scope = "api" } = {}) {
  const role = req.user?.role || req.apiKey ? "api_key" : "anonymous";
  const organizationId = req.organization?._id || req.user?.organizationId || "global";
  const policy = PolicyEngine.resolve({ scope, organizationId, role });
  const risk = Risk.evaluateRequest(req);
  const allowed = risk.score <= policy.maxRiskScore;
  return {
    allowed,
    decision: allowed ? "allow" : "monitor",
    enforcementMode: "monitor",
    policy,
    risk,
    reasons: risk.reasons,
  };
}

function decideIdentity(input = {}) {
  const policy = PolicyEngine.resolve({ scope: "global", organizationId: input.organizationId || "global", role: input.user?.role || "anonymous" });
  const risk = Risk.evaluateIdentity(input);
  return {
    allowed: risk.score <= policy.maxRiskScore,
    decision: risk.score <= policy.maxRiskScore ? "allow" : "deny",
    policy,
    risk,
  };
}

module.exports = { decideIdentity, decideRequest };
