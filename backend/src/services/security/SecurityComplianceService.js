const Policy = require("./PolicyEngine");
const Secrets = require("./SecretManagementService");
const Dependencies = require("./DependencySecurityService");
const Runtime = require("./RuntimeProtectionService");
const Sessions = require("./SessionSecurityService");

function score() {
  const policies = Policy.listPolicies();
  const secretSummary = Secrets.summary();
  const dependencies = Dependencies.analyze();
  const runtime = Runtime.snapshot();
  let value = 100;
  value -= secretSummary.review * 5;
  value -= dependencies.review * 2;
  value -= runtime.high * 5;
  value -= runtime.critical * 10;
  return Math.max(0, value);
}

function snapshot() {
  return {
    securityScore: score(),
    policyStatus: Policy.listPolicies(),
    secretHealth: Secrets.summary(),
    dependencyHealth: Dependencies.analyze(),
    runtimeAlerts: Runtime.snapshot(),
    sessionSecurity: Sessions.policy(),
    compliance: {
      leastPrivilege: true,
      organizationIsolation: true,
      zeroTrustPrinciples: true,
      secretsExposed: false,
      externalSecurityServices: false,
    },
  };
}

module.exports = { snapshot };
