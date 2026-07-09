const AIGovernancePolicy = require("../../models/AIGovernancePolicy");
const AIUsageLog = require("../../models/AIUsageLog");

function defaultPolicy(organizationId = null) {
  return {
    organizationId,
    name: "Default AI Governance Policy",
    status: "active",
    budgets: {
      globalMonthly: 0,
      organizationMonthly: 0,
      userMonthly: 0,
      dailyCost: 0,
      monthlyCost: 0,
      costAlertThresholdPercent: 80,
    },
    routing: { strategy: "priority", requireHealthyProvider: true, allowFallback: true },
    safety: { maskSensitiveData: true, validatePrompts: true, validateResponses: true, promptInjectionDetection: true, outputSafetyChecks: true },
    approvals: { requirePromptApproval: true, requireModelApproval: false, requireHighCostApproval: true, highCostThreshold: 10 },
  };
}

async function getPolicy(organizationId) {
  return AIGovernancePolicy.findOne({ organizationId, status: "active" }).sort({ updatedAt: -1 }).lean().catch(() => null)
    || defaultPolicy(organizationId);
}

function monthStart() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function dayStart() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function usageCost(filter) {
  const rows = await AIUsageLog.find(filter).select("estimatedCost totalTokens status").lean().catch(() => []);
  return {
    requests: rows.length,
    estimatedCost: rows.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
  };
}

async function enforceBudget({ organizationId, userId = null, estimatedCost = 0 } = {}) {
  const policy = await getPolicy(organizationId);
  const monthly = await usageCost({ organizationId, createdAt: { $gte: monthStart() } });
  const daily = await usageCost({ organizationId, createdAt: { $gte: dayStart() } });
  const userMonthly = userId ? await usageCost({ organizationId, userId, createdAt: { $gte: monthStart() } }) : { estimatedCost: 0 };
  const violations = [];
  const b = policy.budgets || {};
  if (b.organizationMonthly && monthly.estimatedCost + estimatedCost > b.organizationMonthly) violations.push("organization_monthly_budget_exceeded");
  if (b.monthlyCost && monthly.estimatedCost + estimatedCost > b.monthlyCost) violations.push("monthly_cost_limit_exceeded");
  if (b.dailyCost && daily.estimatedCost + estimatedCost > b.dailyCost) violations.push("daily_cost_limit_exceeded");
  if (b.userMonthly && userMonthly.estimatedCost + estimatedCost > b.userMonthly) violations.push("user_monthly_budget_exceeded");
  return {
    allowed: violations.length === 0,
    violations,
    policy,
    usage: { monthly, daily, userMonthly },
    estimatedCost,
  };
}

function validatePrompt(content = "") {
  const text = String(content || "");
  const issues = [];
  if (/api[_-]?key|secret|password|jwt/i.test(text)) issues.push("potential_secret_reference");
  if (/ignore (all )?(previous|system) instructions/i.test(text)) issues.push("prompt_injection_pattern");
  if (text.length > 20000) issues.push("prompt_too_large");
  return { valid: issues.length === 0, issues };
}

function validateResponse(content = "") {
  const text = String(content || "");
  const issues = [];
  if (/sk-[A-Za-z0-9_-]{12,}/.test(text) || /BEGIN PRIVATE KEY/.test(text)) issues.push("secret_like_output");
  return { valid: issues.length === 0, issues };
}

module.exports = { defaultPolicy, enforceBudget, getPolicy, validatePrompt, validateResponse };
