const Organization = require("../../models/Organization");
const OrganizationMembership = require("../../models/OrganizationMembership");
const User = require("../../models/User");
const License = require("../../models/License");
const LicenseSite = require("../../models/LicenseSite");
const Order = require("../../models/Order");
const Download = require("../../models/Download");
const Payment = require("../../models/Payment");
const InAppNotification = require("../../models/InAppNotification");
const SupportTicket = require("../../models/SupportTicket");
const { AppError } = require("../../utils/errorHandler");

function safeUser(user) {
  if (!user) return null;
  return {
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: user.companyName || "",
    activeOrganizationId: user.activeOrganizationId || null,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

function safeLicense(license) {
  return {
    id: license._id,
    product: license.productId?.name || license.productId || "",
    plan: license.planId?.name || license.planId || "",
    status: license.status,
    licenseType: license.licenseType,
    allowedSites: license.allowedSites,
    activeDomains: (license.activeDomains || []).map((domain) => domain.domain),
    expiresAt: license.expiresAt,
    renewal: license.renewal,
    entitlements: license.entitlements,
    allowedReleaseChannels: license.allowedReleaseChannels || [],
  };
}

function safeOrder(order) {
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    grandTotal: order.grandTotal || order.amount,
    productId: order.productId,
    licenseId: order.licenseId,
    createdAt: order.createdAt,
  };
}

function summarize(context = {}) {
  return [
    `Audience: ${context.audience}`,
    `User: ${context.user?.email || "unknown"}`,
    `Organization: ${context.organization?.name || "none"}`,
    `Licenses: ${context.licenses?.length || 0}`,
    `Orders: ${context.orders?.length || 0}`,
    `Downloads: ${context.downloads?.length || 0}`,
    `Support tickets: ${context.supportTickets?.length || 0}`,
  ].join("\n");
}

async function assertOrganizationAccess(user, organizationId) {
  if (!organizationId) return null;
  if (user.role === "admin") return Organization.findById(organizationId).lean();
  const membership = await OrganizationMembership.findOne({ organizationId, userId: user._id, status: "active" }).populate("organizationId").lean();
  if (!membership) throw new AppError("You do not have access to this organization.", 403);
  return membership.organizationId;
}

async function buildContext({ actor, organizationId = null, audience = "customer", question = "" } = {}) {
  const org = await assertOrganizationAccess(actor, organizationId || actor.activeOrganizationId || null);
  const userFilter = audience === "admin" && actor.role === "admin" ? {} : { userId: actor._id };
  const orgFilter = org?._id ? { organizationId: org._id } : {};

  const [licenses, orders, downloads, notifications, supportTickets, sites, payments, users] = await Promise.all([
    License.find({ ...orgFilter, ...userFilter }).populate("productId", "name slug").populate("planId", "name allowedSites").sort({ createdAt: -1 }).limit(10).lean(),
    Order.find({ ...orgFilter, ...userFilter }).sort({ createdAt: -1 }).limit(10).lean(),
    Download.find({ ...orgFilter, ...userFilter }).sort({ createdAt: -1 }).limit(10).lean(),
    InAppNotification.find({ userId: actor._id }).sort({ createdAt: -1 }).limit(5).lean(),
    SupportTicket.find(audience === "admin" && actor.role === "admin" ? {} : { userId: actor._id }).sort({ lastMessageAt: -1 }).limit(5).lean(),
    LicenseSite.find(org?._id ? { organizationId: org._id } : {}).sort({ lastContactAt: -1 }).limit(10).lean().catch(() => []),
    audience === "admin" && actor.role === "admin" ? Payment.find(orgFilter).sort({ createdAt: -1 }).limit(10).lean() : [],
    audience === "admin" && actor.role === "admin" ? User.find({}).select("name email role isActive isSuspended activeOrganizationId").limit(10).lean() : [],
  ]);

  const context = {
    audience,
    question: String(question || "").slice(0, 5000),
    user: safeUser(actor),
    organization: org ? { id: org._id, name: org.name, status: org.status, slug: org.slug } : null,
    licenses: licenses.map(safeLicense),
    orders: orders.map(safeOrder),
    downloads: downloads.map((item) => ({ id: item._id, status: item.status, fileName: item.fileName, releaseChannel: item.releaseChannel, createdAt: item.createdAt })),
    notifications: notifications.map((item) => ({ id: item._id, type: item.type, title: item.title, readAt: item.readAt })),
    supportTickets: supportTickets.map((item) => ({ id: item._id, subject: item.subject, status: item.status, lastMessageAt: item.lastMessageAt })),
    activations: sites.map((item) => ({ id: item._id, domain: item.domain, status: item.status, environment: item.environment, lastContactAt: item.lastContactAt })),
    payments: payments.map((item) => ({ id: item._id, status: item.status, gateway: item.gateway, amount: item.amount, currency: item.currency, createdAt: item.createdAt })),
    users: users.map(safeUser),
  };
  return { ...context, summary: summarize(context) };
}

module.exports = { buildContext, summarize };
