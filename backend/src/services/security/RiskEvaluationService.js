const RuntimeProtection = require("./RuntimeProtectionService");

function evaluateRequest(req = {}) {
  let score = 0;
  const reasons = [];
  const path = req.originalUrl || req.path || "";
  const method = req.method || "GET";
  const userAgent = req.get?.("user-agent") || req.headers?.["user-agent"] || "";

  if (!req.id) {
    score += 10;
    reasons.push("missing_request_id");
  }
  if (path.startsWith("/api/v1/admin") && !req.user) {
    score += 45;
    reasons.push("unauthenticated_admin_surface");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !req.get?.("content-type") && Number(req.headers?.["content-length"] || 0) > 0) {
    score += 15;
    reasons.push("mutation_without_content_type");
  }
  if (!userAgent) {
    score += 5;
    reasons.push("missing_user_agent");
  }
  if (RuntimeProtection.isIpFlagged(req.ip)) {
    score += 35;
    reasons.push("flagged_ip");
  }

  return {
    score: Math.min(100, score),
    level: score >= 70 ? "high" : score >= 35 ? "medium" : "low",
    reasons,
  };
}

function evaluateIdentity({ user = null, organizationId = "", permissions = [], session = null } = {}) {
  let score = 0;
  const reasons = [];
  if (!user) {
    score += 60;
    reasons.push("user_missing");
  }
  if (organizationId && !permissions.length && user?.role !== "admin") {
    score += 30;
    reasons.push("no_organization_permissions");
  }
  if (session && session.revoked) {
    score += 80;
    reasons.push("session_revoked");
  }
  return {
    score: Math.min(100, score),
    level: score >= 70 ? "high" : score >= 35 ? "medium" : "low",
    reasons,
  };
}

module.exports = { evaluateIdentity, evaluateRequest };
