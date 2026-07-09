const ACTIONS = {
  license: ["Renew License", "Create Support Ticket"],
  activation: ["Deactivate Site", "Reset Activation", "Create Support Ticket"],
  download: ["Download Latest Version", "Create Support Ticket"],
  renewal: ["Renew License", "Create Support Ticket"],
  payments: ["Create Support Ticket"],
  orders: ["Create Support Ticket"],
  account: ["Update Profile", "Create Support Ticket"],
  version: ["Download Latest Version", "Create Support Ticket"],
  customers: ["Create Support Ticket"],
  analytics: ["Create Support Ticket"],
  organizations: ["Create Support Ticket"],
  general: ["Create Support Ticket"],
};

function redact(text = "") {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "[redacted-api-key]")
    .replace(/JWT[_A-Z]*[_-]?SECRET[^,\s]*/gi, "[redacted-secret]");
}

function formatAnswer({ question = "", category = "general", context = {}, articles = [] } = {}) {
  const lines = [];
  lines.push(`I checked your ${category.replace(/_/g, " ")} context in Parentheses Licence.`);

  if (category === "license" || category === "renewal") {
    const active = (context.licenses || []).filter((license) => ["active", "trial", "lifetime"].includes(license.status));
    lines.push(`You have ${context.licenses?.length || 0} visible license record(s), including ${active.length} currently usable license(s).`);
    const expiring = (context.licenses || []).filter((license) => license.expiresAt).slice(0, 3);
    if (expiring.length) lines.push(`Upcoming/dated licenses: ${expiring.map((license) => `${license.status} until ${new Date(license.expiresAt).toISOString().slice(0, 10)}`).join("; ")}.`);
  } else if (category === "activation") {
    lines.push(`I found ${(context.activations || []).length} recent activated site record(s).`);
    const domains = (context.activations || []).map((site) => site.domain).filter(Boolean).slice(0, 5);
    if (domains.length) lines.push(`Recent domains: ${domains.join(", ")}.`);
  } else if (category === "download" || category === "version") {
    lines.push(`I found ${(context.downloads || []).length} recent download record(s).`);
    const latest = (context.downloads || [])[0];
    if (latest) lines.push(`Most recent download: ${latest.fileName || "download asset"} (${latest.status}, ${latest.releaseChannel || "stable"}).`);
  } else if (category === "payments" || category === "orders") {
    lines.push(`I found ${(context.orders || []).length} visible order(s).`);
    const last = (context.orders || [])[0];
    if (last) lines.push(`Latest order ${last.orderNumber || last.id} is ${last.status} with payment status ${last.paymentStatus}.`);
  } else if (category === "account") {
    lines.push(`Your account email is ${context.user?.email || "not available"} and MFA is ${context.user?.twoFactorEnabled ? "enabled" : "not enabled"}.`);
  } else if (context.audience === "admin") {
    lines.push(`Admin context includes ${(context.users || []).length} user sample(s), ${(context.licenses || []).length} license sample(s), and ${(context.orders || []).length} order sample(s).`);
  } else {
    lines.push(`I found ${(context.supportTickets || []).length} recent support ticket(s) and ${(context.notifications || []).length} recent notification(s).`);
  }

  if (articles.length) lines.push(`Relevant guidance: ${articles.map((article) => article.title).join(", ")}.`);
  lines.push("Suggested next steps are recommendations only; I will not execute account or admin actions automatically.");

  return {
    answer: redact(lines.join("\n")),
    suggestedActions: ACTIONS[category] || ACTIONS.general,
  };
}

module.exports = { formatAnswer, redact };
