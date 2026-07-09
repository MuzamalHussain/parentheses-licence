const Download = require("../../models/Download");
const LicenseSite = require("../../models/LicenseSite");
const SupportTicket = require("../../models/SupportTicket");

async function health({ product, version, organizationId }) {
  const since = new Date(Date.now() - 30 * 86400000);
  const scoped = organizationId ? { organizationId } : {};
  const [downloads, activeInstallations, failedDownloads, supportTickets] = await Promise.all([
    Download.countDocuments({ ...scoped, productId: product._id, pluginVersionId: version._id, status: { $in: ["completed", "authorized"] } }).catch(() => 0),
    LicenseSite.countDocuments({ ...scoped, productId: product._id, pluginVersion: version.versionNumber, status: "active" }).catch(() => 0),
    Download.countDocuments({ ...scoped, productId: product._id, pluginVersionId: version._id, status: { $in: ["denied", "missing_file", "invalid_signature"] } }).catch(() => 0),
    SupportTicket.countDocuments({ createdAt: { $gte: since }, subject: new RegExp(String(product.name || product.slug || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).catch(() => 0),
  ]);
  return {
    downloads,
    upgradeAdoption: activeInstallations,
    upgradeFailures: failedDownloads,
    rollbackRequests: 0,
    supportTicketVolume: supportTickets,
    healthStatus: failedDownloads > 10 || supportTickets > 20 ? "degraded" : "ok",
  };
}

module.exports = { health };
