const crypto = require("crypto");
const Environments = require("./DeploymentEnvironmentService");
const Pipeline = require("./DeploymentPipeline");
const Approvals = require("./DeploymentApprovalService");
const History = require("./DeploymentHistoryService");
const HealthVerifier = require("./DeploymentHealthVerifier");
const Rollback = require("./RollbackService");
const { writeAuditLog } = require("../../utils/auditLog");

async function audit(action, { actor, targetId, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({ actor, action, targetType: "Deployment", targetId, metadata, ip, requestId });
}

async function startDeployment({ version, environment = "development", previousVersion = "", operator = null, ip = "", requestId = "" } = {}) {
  const env = Environments.getEnvironment(environment);
  if (!env) throw new Error("Unknown deployment environment.");
  const id = `dep_${crypto.randomUUID()}`;
  const deployment = History.record({
    id,
    version: version || "unversioned",
    previousVersion,
    environment,
    operator: operator?._id || null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: 0,
    status: "pending",
    verificationResults: null,
    rollbackStatus: "not_requested",
    approvalStatus: Approvals.requiresApproval(environment) ? "pending" : "auto_approved",
  });
  const approval = Approvals.requestApproval({ deploymentId: id, environment, version, operator });
  await audit("deployment.started", { actor: operator, targetId: id, metadata: { environment, version, approvalStatus: approval.status }, ip, requestId });
  if (approval.status === "auto_approved") return completeDeployment(id, { actor: operator, ip, requestId });
  return { ...deployment, approval };
}

async function completeDeployment(deploymentId, context = {}) {
  const deployment = History.get(deploymentId);
  if (!deployment) throw new Error("Deployment not found.");
  const approval = Approvals.getByDeployment(deploymentId);
  if (approval && approval.status === "rejected") throw new Error("Deployment approval was rejected.");
  if (approval && approval.status === "pending") return { ...deployment, approval, waitingForApproval: true };
  const pipeline = await Pipeline.run({ deploymentId, environment: deployment.environment, version: deployment.version });
  const completed = History.update(deploymentId, {
    completedAt: new Date().toISOString(),
    durationMs: pipeline.durationMs,
    status: pipeline.status === "passed" ? "completed" : "failed",
    verificationResults: pipeline.steps.find((step) => step.step === "post_deployment_verification")?.verification || null,
    pipeline,
  });
  await audit(completed.status === "completed" ? "deployment.completed" : "deployment.failed", {
    actor: context.actor,
    targetId: deploymentId,
    metadata: { status: completed.status, environment: completed.environment, version: completed.version },
    ip: context.ip,
    requestId: context.requestId,
  });
  return completed;
}

async function promote({ from = "development", to = "staging", version, operator = null, ip = "", requestId = "" } = {}) {
  const path = Environments.promotionPath(from, to);
  if (!path.length) throw new Error("Invalid promotion path.");
  const deployment = await startDeployment({ version, environment: to, operator, ip, requestId });
  return { promotionPath: path.map((item) => item.id), deployment };
}

async function verifyHealth(environment = "local") {
  return HealthVerifier.verify(environment);
}

async function dashboard() {
  return {
    generatedAt: new Date().toISOString(),
    environments: Environments.listEnvironments(),
    pipeline: Pipeline.plan(),
    deployments: History.list().slice(0, 50),
    approvals: Approvals.list().slice(0, 50),
    health: await HealthVerifier.verify(Environments.currentEnvironmentConfig().environmentVariables.APP_ENV || "local"),
    rollback: History.list().slice(0, 10).map((deployment) => Rollback.validate({ deploymentId: deployment.id })),
    blueGreen: Environments.listEnvironments().map((env) => Rollback.blueGreenFoundation(env.id)),
    providers: [
      { id: "github_actions", name: "GitHub Actions", status: "future" },
      { id: "gitlab_ci", name: "GitLab CI/CD", status: "future" },
      { id: "azure_devops", name: "Azure DevOps", status: "future" },
      { id: "railway", name: "Railway", status: "future" },
      { id: "render", name: "Render", status: "future" },
    ],
  };
}

module.exports = { completeDeployment, dashboard, promote, startDeployment, verifyHealth };
