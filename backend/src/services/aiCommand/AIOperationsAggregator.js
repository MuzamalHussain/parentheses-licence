const OperationsService = require("../operations/OperationsService");
const AIManager = require("../ai/AIManager");
const AIUsageLog = require("../../models/AIUsageLog");
const AIFraudRisk = require("../../models/AIFraudRisk");
const AIWorkflowApproval = require("../../models/AIWorkflowApproval");
const WorkflowJob = require("../../models/WorkflowJob");
const OrganizationMembership = require("../../models/OrganizationMembership");
const Order = require("../../models/Order");
const Download = require("../../models/Download");
const License = require("../../models/License");

function counts(rows = [], key = "status") {
  return rows.reduce((out, row) => {
    const value = row[key] || row._id || "unknown";
    out[value] = (out[value] || 0) + (row.count || 1);
    return out;
  }, {});
}

async function aiProviderMonitor(organizationId, actor) {
  const overview = await AIManager.overview(organizationId, { actor }).catch(() => ({ providers: [], usage: [] }));
  const usageRows = await AIUsageLog.find({ organizationId }).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  const failures = usageRows.filter((row) => row.status === "failed").length;
  const fallbackEvents = usageRows.filter((row) => row.status === "fallback").length;
  return {
    providers: overview.providers || [],
    usage: overview.usage || [],
    failures,
    fallbackEvents,
    totalTokens: usageRows.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
    estimatedCost: usageRows.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0),
    averageLatencyMs: usageRows.length ? Math.round(usageRows.reduce((sum, row) => sum + Number(row.responseTimeMs || 0), 0) / usageRows.length) : 0,
  };
}

async function workflowMonitor(organizationId) {
  const [approvals, jobs] = await Promise.all([
    AIWorkflowApproval.find({ organizationId }).sort({ createdAt: -1 }).limit(100).lean().catch(() => []),
    WorkflowJob.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []),
  ]);
  const jobCounts = counts(jobs);
  const completed = jobCounts.completed || 0;
  const failed = jobCounts.failed || 0;
  return {
    runningWorkflows: jobCounts.running || 0,
    pendingApprovals: approvals.filter((item) => item.status === "pending").length,
    failedWorkflows: failed,
    executionSuccessRate: completed + failed ? Math.round((completed / (completed + failed)) * 10000) / 100 : 100,
    approvals,
    jobCounts,
  };
}

async function securityMonitor(organizationId) {
  const risks = await AIFraudRisk.find({ organizationId }).sort({ createdAt: -1 }).limit(100).lean().catch(() => []);
  return {
    highRiskAccounts: risks.filter((risk) => risk.entityType === "account" && ["high", "critical"].includes(risk.riskLevel)),
    highRiskOrganizations: risks.filter((risk) => risk.entityType === "organization" && ["high", "critical"].includes(risk.riskLevel)),
    licenseAbuse: risks.filter((risk) => risk.entityType === "license"),
    apiAbuse: risks.filter((risk) => risk.entityType === "api_key"),
    recentSecurityEvents: risks.slice(0, 10),
    riskCounts: risks.reduce((out, risk) => ({ ...out, [risk.riskLevel]: (out[risk.riskLevel] || 0) + 1 }), { low: 0, medium: 0, high: 0, critical: 0 }),
  };
}

async function businessMonitor(organizationId) {
  const since = new Date(Date.now() - 30 * 86400000);
  const scoped = organizationId ? { organizationId } : {};
  const [orders, downloads, renewals, memberships] = await Promise.all([
    Order.find({ ...scoped, createdAt: { $gte: since }, status: { $in: ["paid", "completed"] } }).select("grandTotal amount").lean().catch(() => []),
    Download.countDocuments({ ...scoped, createdAt: { $gte: since } }).catch(() => 0),
    License.countDocuments({ ...scoped, "renewal.lastRenewedAt": { $gte: since } }).catch(() => 0),
    OrganizationMembership.countDocuments({ organizationId, status: "active" }).catch(() => 0),
  ]);
  return {
    revenue: orders.reduce((sum, order) => sum + Number(order.grandTotal || order.amount || 0), 0),
    orders: orders.length,
    renewals,
    downloads,
    organizations: organizationId ? 1 : 0,
    customerGrowth: executive.customers?.newInRange || 0,
    activeMembers: memberships,
  };
}

async function aggregate({ organizationId, actor } = {}) {
  const [operations, aiProviders, workflow, security, business] = await Promise.all([
    OperationsService.getDashboard().catch(() => ({})),
    aiProviderMonitor(organizationId, actor),
    workflowMonitor(organizationId),
    securityMonitor(organizationId),
    businessMonitor(organizationId),
  ]);
  return { operations, aiProviders, workflow, security, business, generatedAt: new Date() };
}

module.exports = { aggregate, aiProviderMonitor, workflowMonitor, securityMonitor, businessMonitor };
