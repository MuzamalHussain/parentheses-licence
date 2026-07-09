const EnterpriseIdentity = require("../identity/EnterpriseIdentityService");

const revokedSessions = new Set();

function policy() {
  return {
    sessionRotation: "foundation",
    idleTimeout: true,
    absoluteTimeout: true,
    sessionRevocation: true,
    concurrentSessionLimits: true,
  };
}

function revoke(sessionId) {
  revokedSessions.add(String(sessionId));
  return { sessionId, revoked: true };
}

function isRevoked(sessionId) {
  return revokedSessions.has(String(sessionId));
}

function validateSession(session, organizationPolicy = EnterpriseIdentity.DEFAULT_POLICY) {
  if (!session) return { valid: false, reason: "missing_session" };
  if (isRevoked(session.sessionId)) return { valid: false, reason: "revoked" };
  const allowed = EnterpriseIdentity.sessionPolicyAllows(session, organizationPolicy);
  return { valid: allowed, reason: allowed ? "ok" : "expired_or_idle" };
}

function resetForTests() {
  revokedSessions.clear();
}

module.exports = { isRevoked, policy, resetForTests, revoke, validateSession };
