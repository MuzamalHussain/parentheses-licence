const PluginVersion = require("../../models/PluginVersion");
const License = require("../../models/License");
const LicenseSite = require("../../models/LicenseSite");
const OrganizationMembership = require("../../models/OrganizationMembership");

function parseMajorMinor(value = "") {
  const [major, minor] = String(value || "").split(".").map((part) => Number(part) || 0);
  return major * 100 + minor;
}

function below(version, required) {
  if (!version || !required) return false;
  return parseMajorMinor(version) < parseMajorMinor(required);
}

async function previousVersion(productId, version) {
  return PluginVersion.findOne({ productId, _id: { $ne: version._id }, isPublished: true })
    .sort({ releasedAt: -1, createdAt: -1 })
    .lean()
    .catch(() => null);
}

async function analyze({ product, version, organizationId }) {
  const [previous, sites, activeLicenses, members] = await Promise.all([
    previousVersion(product._id, version),
    LicenseSite.find({ productId: product._id, ...(organizationId ? { organizationId } : {}), status: "active" }).select("pluginVersion wordpressVersion phpVersion environment").limit(500).lean().catch(() => []),
    License.countDocuments({ productId: product._id, ...(organizationId ? { organizationId } : {}), status: { $in: ["active", "lifetime", "trial"] } }).catch(() => 0),
    organizationId ? OrganizationMembership.countDocuments({ organizationId, status: "active" }).catch(() => 0) : 0,
  ]);
  const wpAtRisk = sites.filter((site) => below(site.wordpressVersion, version.minWpVersion)).length;
  const phpAtRisk = sites.filter((site) => below(site.phpVersion, version.minPhpVersion)).length;
  const installedVersionCounts = sites.reduce((out, site) => ({ ...out, [site.pluginVersion || "unknown"]: (out[site.pluginVersion || "unknown"] || 0) + 1 }), {});
  const migrationImpact = Boolean(version.changelogSections?.breakingChanges || version.changelogSections?.developerNotes);
  return {
    wordpress: {
      requiresAtLeast: version.minWpVersion || product.minWpVersion || "",
      testedUpTo: version.testedUpTo || product.testedUpTo || "",
      activeSitesBelowRequirement: wpAtRisk,
    },
    php: {
      requiresAtLeast: version.minPhpVersion || product.minPhpVersion || "",
      activeSitesBelowRequirement: phpAtRisk,
    },
    dependencies: product.dependencies || [],
    themeCompatibilityFoundation: true,
    databaseMigrationImpact: migrationImpact ? "possible" : "none_detected",
    previousVersion: previous ? { id: previous._id, versionNumber: previous.versionNumber, minWpVersion: previous.minWpVersion, minPhpVersion: previous.minPhpVersion } : null,
    customerImpact: {
      activeLicenses,
      activeSites: sites.length,
      organizationSize: members,
      installedVersionCounts,
      estimatedAtRiskSites: wpAtRisk + phpAtRisk,
    },
  };
}

module.exports = { analyze, below };
