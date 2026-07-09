const HELP_ARTICLES = [
  { category: "license", title: "License status", body: "Active licenses can download releases, receive updates, and activate sites according to their plan limits." },
  { category: "activation", title: "Site activation", body: "A site activation links a license to a domain. Customers can deactivate their own sites when a license allows activations." },
  { category: "download", title: "Secure downloads", body: "Downloads are authorized against license entitlement, release channel eligibility, and download limits." },
  { category: "renewal", title: "Renewals", body: "Renewal eligibility depends on license status, expiration, grace period, and plan rules." },
  { category: "payments", title: "Payments", body: "Payment status is tracked from orders and payment transactions. Failed or pending payments may prevent license creation." },
  { category: "orders", title: "Orders", body: "Completed orders are linked to products, licenses, and download eligibility." },
  { category: "account", title: "Account", body: "Customers can update profile details, manage sessions, and review account security events." },
  { category: "version", title: "Versions", body: "Latest version access depends on product release channels and license entitlement." },
  { category: "general", title: "Support", body: "If the answer is not enough, create a support ticket with the license, order, or domain details." },
];

function detectCategory(question = "", audience = "customer") {
  const text = String(question || "").toLowerCase();
  if (/activat|domain|site/.test(text)) return "activation";
  if (/download|zip|release/.test(text)) return "download";
  if (/renew|expire|grace/.test(text)) return "renewal";
  if (/pay|payment|refund|charge/.test(text)) return "payments";
  if (/order|invoice|billing/.test(text)) return "orders";
  if (/account|profile|password|email/.test(text)) return "account";
  if (/version|update|stable|beta/.test(text)) return "version";
  if (/customer|user/.test(text) && audience === "admin") return "customers";
  if (/analytic|metric|report/.test(text) && audience === "admin") return "analytics";
  if (/organization|tenant|member/.test(text) && audience === "admin") return "organizations";
  if (/license|key|plan/.test(text)) return "license";
  return "general";
}

function articlesFor(category) {
  return HELP_ARTICLES.filter((article) => article.category === category || article.category === "general");
}

module.exports = { HELP_ARTICLES, articlesFor, detectCategory };
