const Order = require("../../models/Order");
const License = require("../../models/License");
const SupportTicket = require("../../models/SupportTicket");
const AIFraudRisk = require("../../models/AIFraudRisk");
const Templates = require("./AIWorkflowTemplates");
const Policy = require("./AIWorkflowPolicyService");

function range(days = 30) {
  return { $gte: new Date(Date.now() - days * 86400000), $lte: new Date() };
}

function step(key, label, eventName, payload = {}, restricted = false) {
  return { key, label, eventName, payload, restricted };
}

function recommendation({ organizationId, template, reason, evidence, confidenceScore, affectedResources, riskLevel = "low", payload = {}, restricted = false }) {
  return {
    organizationId,
    category: template.category,
    templateKey: template.key,
    title: template.title,
    reason,
    supportingEvidence: evidence,
    confidenceScore,
    expectedOutcome: template.outcome,
    affectedResources,
    riskLevel,
    plan: [step(`${template.key}.dispatch`, `Dispatch ${template.title}`, template.eventName, { organizationId, ...payload }, restricted)],
  };
}

async function plan({ organizationId } = {}) {
  const [failedPayments, expiringLicenses, openSupport, highRisks] = await Promise.all([
    Order.find({ organizationId, $or: [{ status: "failed" }, { paymentStatus: "failed" }], createdAt: range(30) }).select("_id userId status paymentStatus").limit(10).lean(),
    License.find({ organizationId, status: "active", expiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86400000) } }).select("_id userId expiresAt").limit(10).lean(),
    SupportTicket.find({ organizationId, status: { $in: ["open", "pending"] } }).select("_id subject status userId").limit(10).lean().catch(() => []),
    AIFraudRisk.find({ organizationId, riskLevel: { $in: ["high", "critical"] }, status: "open" }).sort({ score: -1 }).limit(10).lean().catch(() => []),
  ]);

  const items = [];
  const paymentTemplate = Templates.get("payment_recovery");
  if (failedPayments.length) {
    items.push(recommendation({
      organizationId,
      template: paymentTemplate,
      reason: `${failedPayments.length} failed payment or failed order records were found in the last 30 days.`,
      evidence: failedPayments.map((order) => ({ source: "orders", id: order._id, status: order.status, paymentStatus: order.paymentStatus })),
      confidenceScore: Math.min(95, 50 + failedPayments.length * 5),
      affectedResources: failedPayments.map((order) => ({ type: "order", id: order._id })),
      payload: { orderIds: failedPayments.map((order) => order._id) },
    }));
  }

  const renewalTemplate = Templates.get("license_renewal");
  if (expiringLicenses.length) {
    items.push(recommendation({
      organizationId,
      template: renewalTemplate,
      reason: `${expiringLicenses.length} active licenses expire within 30 days.`,
      evidence: expiringLicenses.map((license) => ({ source: "licenses", id: license._id, expiresAt: license.expiresAt })),
      confidenceScore: Math.min(95, 55 + expiringLicenses.length * 4),
      affectedResources: expiringLicenses.map((license) => ({ type: "license", id: license._id })),
      payload: { licenseIds: expiringLicenses.map((license) => license._id) },
    }));
  }

  const supportTemplate = Templates.get("customer_follow_up");
  if (openSupport.length) {
    items.push(recommendation({
      organizationId,
      template: supportTemplate,
      reason: `${openSupport.length} support tickets are open or pending.`,
      evidence: openSupport.map((ticket) => ({ source: "support", id: ticket._id, status: ticket.status, subject: ticket.subject })),
      confidenceScore: Math.min(90, 50 + openSupport.length * 4),
      affectedResources: openSupport.map((ticket) => ({ type: "support_ticket", id: ticket._id })),
      payload: { ticketIds: openSupport.map((ticket) => ticket._id) },
    }));
  }

  const securityTemplate = Templates.get("security_alert");
  if (highRisks.length) {
    items.push(recommendation({
      organizationId,
      template: securityTemplate,
      reason: `${highRisks.length} high or critical AI security risks are currently open.`,
      evidence: highRisks.map((risk) => ({ source: "ai_fraud_risks", id: risk._id, score: risk.score, riskLevel: risk.riskLevel })),
      confidenceScore: Math.min(98, 65 + highRisks.length * 5),
      affectedResources: highRisks.map((risk) => ({ type: risk.entityType, id: risk.entityId || risk._id })),
      riskLevel: highRisks.some((risk) => risk.riskLevel === "critical") ? "critical" : "high",
      payload: { riskIds: highRisks.map((risk) => risk._id) },
      restricted: false,
    }));
  }

  const planned = [];
  for (const item of items) {
    const policy = await Policy.resolve({ organizationId, category: item.category, riskLevel: item.riskLevel });
    planned.push({ ...item, mode: policy.mode, policySnapshot: policy });
  }
  return planned;
}

module.exports = { plan };
