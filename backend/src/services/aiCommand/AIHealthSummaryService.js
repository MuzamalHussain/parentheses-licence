function alert(level, source, title, message, evidence = {}) {
  return { level, source, title, message, evidence, timestamp: new Date() };
}

function fromAggregates(data) {
  const alerts = [];
  const health = data.operations?.systemHealth || {};
  if (health.status && !["ok", "healthy"].includes(String(health.status).toLowerCase())) {
    alerts.push(alert("high", "operations", "Platform health degraded", `System health is ${health.status}.`, health));
  }
  if ((data.operations?.payments?.failedPayments || 0) > 0) {
    alerts.push(alert("medium", "payments", "Failed payments detected", `${data.operations.payments.failedPayments} failed payments require review.`, data.operations.payments));
  }
  if ((data.operations?.queue?.failed || 0) > 0) {
    alerts.push(alert("high", "workflows", "Workflow failures detected", `${data.operations.queue.failed} workflow jobs are failed.`, data.operations.queue));
  }
  if ((data.security?.riskCounts?.critical || 0) > 0) {
    alerts.push(alert("critical", "security", "Critical security risks", `${data.security.riskCounts.critical} critical AI fraud risks are open.`, data.security.riskCounts));
  }
  if ((data.aiProviders?.failures || 0) > 0) {
    alerts.push(alert("medium", "ai_providers", "AI provider failures", `${data.aiProviders.failures} recent AI calls failed.`, { failures: data.aiProviders.failures }));
  }
  if ((data.workflow?.pendingApprovals || 0) > 0) {
    alerts.push(alert("informational", "ai_workflows", "AI workflow approvals waiting", `${data.workflow.pendingApprovals} AI workflow recommendations are pending approval.`, { pendingApprovals: data.workflow.pendingApprovals }));
  }
  return {
    alerts,
    health: {
      licensing: data.operations?.licenseServer || {},
      payments: data.operations?.payments || {},
      downloads: { total: data.business?.downloads || 0 },
      api: data.operations?.api || {},
      webhooks: data.operations?.payments?.webhooks || {},
      notifications: data.operations?.email || {},
      aiProviders: data.aiProviders,
      queueWorkers: data.operations?.queue || {},
      database: data.operations?.database || {},
      storage: data.operations?.systemHealth?.storage || {},
    },
  };
}

module.exports = { fromAggregates };
