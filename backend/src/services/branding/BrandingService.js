const Organization = require("../../models/Organization");
const OrganizationBrand = require("../../models/OrganizationBrand");
const OrganizationService = require("../organizationService");
const { writeAuditLog } = require("../../utils/auditLog");

const DEFAULT_BRAND = {
  identity: {
    organizationName: "Parentheses",
    displayName: "Parentheses",
    tagline: "Software licensing and distribution",
    website: "",
    supportUrl: "",
    supportEmail: "",
  },
  assets: {
    primaryLogo: {},
    darkLogo: {},
    favicon: {},
    loginBackground: {},
    dashboardLogo: {},
    emailBanner: {},
    defaultAvatar: {},
  },
  theme: {
    primaryColor: "#2563eb",
    secondaryColor: "#111827",
    accentColor: "#14b8a6",
    successColor: "#16a34a",
    warningColor: "#d97706",
    dangerColor: "#dc2626",
    backgroundColor: "#f9fafb",
    sidebarColor: "#ffffff",
    headerColor: "#ffffff",
    buttonColor: "#2563eb",
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    baseFontSize: 16,
    headingScale: 1.2,
    borderRadius: 8,
    spacingScale: 1,
  },
  login: { welcomeText: "", footerText: "", links: [] },
  portal: { footerText: "", navigationLabel: "" },
  email: { senderName: "", senderEmail: "", replyTo: "", headerHtml: "", footerHtml: "", signatureHtml: "" },
  whiteLabel: {
    hideParenthesesBranding: false,
    hidePlatformReferences: false,
    hideVersionFooter: false,
    poweredByText: "Powered by Parentheses",
  },
  domain: { customDomain: "", validationStatus: "not_configured", sslReady: false, dnsTarget: "" },
};

const ALLOWED_ASSET_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"];
const ASSET_FIELDS = ["primaryLogo", "darkLogo", "favicon", "loginBackground", "dashboardLogo", "emailBanner", "defaultAvatar"];

function makeError(message, statusCode = 422, code = "BRANDING_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function mergeBrand(base, override = {}) {
  const output = JSON.parse(JSON.stringify(base));
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) output[key] = { ...(output[key] || {}), ...value };
    else output[key] = value;
  }
  return output;
}

function publicBrandPayload(brand, organization = null) {
  const merged = mergeBrand(DEFAULT_BRAND, brand?.toObject ? brand.toObject() : brand);
  const customIdentity = brand?.identity || {};
  merged.identity.organizationName = customIdentity.organizationName || organization?.name || DEFAULT_BRAND.identity.organizationName;
  merged.identity.displayName = customIdentity.displayName || organization?.name || DEFAULT_BRAND.identity.displayName;
  merged.identity.website = merged.identity.website || organization?.website || "";
  merged.identity.supportEmail = merged.identity.supportEmail || organization?.branding?.supportEmail || organization?.billingEmail || "";
  return merged;
}

function validateTheme(theme = {}) {
  const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  Object.entries(theme).forEach(([key, value]) => {
    if (value && !HEX.test(value)) throw makeError(`${key} must be a valid hex color.`, 422, "BRAND_INVALID_COLOR");
  });
}

function validateAsset(field, asset = {}) {
  if (!ASSET_FIELDS.includes(field)) throw makeError("Asset field is invalid.", 422, "BRAND_INVALID_ASSET_FIELD");
  if (asset.contentType && !ALLOWED_ASSET_TYPES.includes(asset.contentType)) throw makeError("Asset type is not allowed.", 422, "BRAND_ASSET_TYPE_DENIED");
  if (asset.fileSizeBytes && asset.fileSizeBytes > 2 * 1024 * 1024) throw makeError("Asset is too large.", 422, "BRAND_ASSET_TOO_LARGE");
  if (asset.url && !/^https?:\/\/|^\//.test(asset.url)) throw makeError("Asset URL must be relative or HTTPS.", 422, "BRAND_INVALID_ASSET_URL");
}

async function audit(action, { actor, organizationId, metadata = {}, ip = "", requestId = "" } = {}) {
  await writeAuditLog({ actor, action, targetType: "OrganizationBrand", targetId: organizationId, metadata: { organizationId, ...metadata }, ip, requestId });
}

async function getBrand(organizationId) {
  const [organization, brand] = await Promise.all([
    Organization.findById(organizationId),
    OrganizationBrand.findOne({ organizationId }),
  ]);
  if (!organization) throw makeError("Organization not found.", 404, "ORG_NOT_FOUND");
  return publicBrandPayload(brand, organization);
}

async function getBrandForRequest({ organizationId, host } = {}) {
  if (organizationId) return getBrand(organizationId);
  if (host) {
    const brand = await OrganizationBrand.findOne({ "domain.customDomain": String(host).toLowerCase() });
    if (brand) {
      const organization = await Organization.findById(brand.organizationId);
      return publicBrandPayload(brand, organization);
    }
  }
  return publicBrandPayload(null, null);
}

async function updateBrand(organizationId, updates = {}, context = {}) {
  await OrganizationService.assertRole(context.actor._id, organizationId, ["owner", "admin"]);
  validateTheme(updates.theme || {});
  const patch = {};
  ["identity", "theme", "typography", "login", "portal", "email", "whiteLabel", "domain"].forEach((section) => {
    if (updates[section] !== undefined) patch[section] = updates[section];
  });
  patch.updatedBy = context.actor._id;
  const brand = await OrganizationBrand.findOneAndUpdate(
    { organizationId },
    { $set: patch, $setOnInsert: { organizationId } },
    { new: true, upsert: true, runValidators: true }
  );
  await audit("brand.updated", { ...context, organizationId, metadata: { sections: Object.keys(patch).filter((key) => key !== "updatedBy") } });
  if (updates.theme) await audit("brand.theme_changed", { ...context, organizationId });
  if (updates.whiteLabel?.hideParenthesesBranding) await audit("brand.white_label_enabled", { ...context, organizationId });
  return publicBrandPayload(brand, await Organization.findById(organizationId));
}

async function updateAsset(organizationId, field, asset = {}, context = {}) {
  await OrganizationService.assertRole(context.actor._id, organizationId, ["owner", "admin"]);
  validateAsset(field, asset);
  const brand = await OrganizationBrand.findOneAndUpdate(
    { organizationId },
    { $set: { [`assets.${field}`]: asset, updatedBy: context.actor._id }, $setOnInsert: { organizationId } },
    { new: true, upsert: true, runValidators: true }
  );
  await audit("brand.asset_uploaded", { ...context, organizationId, metadata: { field, contentType: asset.contentType || "" } });
  return publicBrandPayload(brand, await Organization.findById(organizationId));
}

async function resetBrand(organizationId, context = {}) {
  await OrganizationService.assertRole(context.actor._id, organizationId, ["owner", "admin"]);
  await OrganizationBrand.findOneAndDelete({ organizationId });
  await audit("brand.reset", { ...context, organizationId });
  return getBrand(organizationId);
}

function themedEmail(template, brand = {}) {
  const resolved = publicBrandPayload(brand, null);
  return {
    senderName: resolved.email.senderName || resolved.identity.displayName,
    senderEmail: resolved.email.senderEmail || resolved.identity.supportEmail,
    replyTo: resolved.email.replyTo || resolved.identity.supportEmail,
    headerHtml: resolved.email.headerHtml,
    footerHtml: resolved.email.footerHtml || resolved.whiteLabel.poweredByText,
    signatureHtml: resolved.email.signatureHtml,
    html: `${resolved.email.headerHtml || ""}${template.html}${resolved.email.signatureHtml || ""}${resolved.email.footerHtml || ""}`,
    subject: template.subject.replace(/Parentheses/g, resolved.whiteLabel.hidePlatformReferences ? resolved.identity.displayName : "Parentheses"),
  };
}

module.exports = {
  DEFAULT_BRAND,
  ALLOWED_ASSET_TYPES,
  ASSET_FIELDS,
  publicBrandPayload,
  validateTheme,
  validateAsset,
  getBrand,
  getBrandForRequest,
  updateBrand,
  updateAsset,
  resetBrand,
  themedEmail,
};
