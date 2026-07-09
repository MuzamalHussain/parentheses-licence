const History = require("./DeploymentHistoryService");

function validate({ deploymentId, targetVersion = "", rollbackType = "application" } = {}) {
  const deployment = History.get(deploymentId);
  const errors = [];
  if (!deployment) errors.push("deployment_not_found");
  if (!["application", "configuration", "release"].includes(rollbackType)) errors.push("invalid_rollback_type");
  if (!targetVersion && !deployment?.previousVersion) errors.push("target_version_required");
  return {
    valid: errors.length === 0,
    errors,
    deploymentId,
    targetVersion: targetVersion || deployment?.previousVersion || "",
    rollbackType,
    rollbackStatus: errors.length ? "blocked" : "ready",
    validationSteps: [
      "Confirm target version exists.",
      "Validate configuration compatibility.",
      "Run deployment health checks.",
      "Prepare manual approval gate.",
    ],
  };
}

function blueGreenFoundation(environment) {
  return {
    environment,
    blue: { slot: "blue", role: "current", healthValidation: true },
    green: { slot: "green", role: "standby", healthValidation: true },
    trafficSwitching: "foundation_only",
    liveTrafficSwitchingEnabled: false,
  };
}

module.exports = { blueGreenFoundation, validate };
