const asyncHandler   = require("express-async-handler");
const License        = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const PluginVersion  = require("../models/PluginVersion");
const { AppError }   = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const { isNewerVersion } = require("../utils/semver");

// ── Shared: resolve + validate a license ────────────────────────────────────
async function resolveLicense(licenseKey, productSlug) {
  const license = await License.findOne({ licenseKey })
    .populate("productId", "name slug status")
    .populate("planId",    "name allowedSites");

  if (!license)                          return { error: "License key not found.",               code: 404 };
  if (license.status === "revoked")      return { error: "This license has been revoked.",        code: 403 };
  if (license.status === "suspended")    return { error: "This license is currently suspended. Contact support.", code: 403 };
  if (license.status === "expired")      return { error: "This license has expired.",             code: 403 };

  // Date-based expiry check (status may not yet be "expired" if cron hasn't run)
  if (license.expiresAt && new Date() > license.expiresAt) {
    license.status = "expired";
    await license.save({ validateBeforeSave: false });
    return { error: "This license has expired.", code: 403 };
  }

  // Product slug check — prevent cross-product key reuse
  if (productSlug && license.productId?.slug !== productSlug) {
    return { error: "This license key is not valid for this product.", code: 403 };
  }

  if (license.productId?.status === "archived") {
    return { error: "This product is no longer available.", code: 403 };
  }

  return { license };
}

// ── Safe license response (never leaks internal IDs etc.) ───────────────────
function safeResponse(license, message) {
  return {
    success:      true,
    message,
    licenseKey:   license.licenseKey,
    status:       license.status,
    product:      license.productId?.name,
    plan:         license.planId?.name,
    allowedSites: license.allowedSites === 0 ? "unlimited" : license.allowedSites,
    usedSites:    license.activeDomains.length,
    expiresAt:    license.expiresAt || null,
    activeDomains: license.activeDomains.map((d) => d.domain),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/plugin/activate
// Body: { licenseKey, domain, product }
// Called by the WordPress plugin on activation
// ─────────────────────────────────────────────────────────────────────────────
exports.activate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain)     throw new AppError("domain is required.", 422);

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) throw new AppError("Invalid domain format.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) return res.status(code).json({ success: false, message: error });

  // Already activated on this domain? → idempotent success
  const alreadyActive = license.activeDomains.find((d) => d.domain === normalizedDomain);
  if (alreadyActive) {
    return res.json(safeResponse(license, "License is already active on this domain."));
  }

  // Site limit enforcement
  const siteLimit = license.allowedSites; // 0 = unlimited
  if (siteLimit > 0 && license.activeDomains.length >= siteLimit) {
    return res.status(403).json({
      success: false,
      message: `Site limit reached (${siteLimit} site${siteLimit !== 1 ? "s" : ""} allowed). Deactivate another domain first.`,
      allowedSites: siteLimit,
      usedSites:    license.activeDomains.length,
      activeDomains: license.activeDomains.map((d) => d.domain),
    });
  }

  // Activate
  license.activeDomains.push({ domain: normalizedDomain, activatedAt: new Date() });
  await license.save();

  // Write activation event log
  await LicenseActivation.create({
    licenseId: license._id,
    domain:    normalizedDomain,
    action:    "activate",
    actorRole: "plugin",
    ipAddress: req.ip || "",
  });

  await writeAuditLog({
    action:     "license.domain_activated",
    targetType: "License",
    targetId:   license._id,
    metadata:   { licenseKey: license.licenseKey, domain: normalizedDomain },
    ip:         req.ip,
  });

  return res.status(201).json(safeResponse(license, "License activated successfully."));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/plugin/deactivate
// Body: { licenseKey, domain, product }
// Called by the WordPress plugin on deactivation
// ─────────────────────────────────────────────────────────────────────────────
exports.deactivate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain)     throw new AppError("domain is required.", 422);

  const normalizedDomain = normalizeDomain(domain);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );

  // Allow deactivation even if suspended (customer may want to free slots)
  if (error && code !== 403) {
    return res.status(code).json({ success: false, message: error });
  }
  if (!license) {
    return res.status(code).json({ success: false, message: error });
  }

  const idx = license.activeDomains.findIndex((d) => d.domain === normalizedDomain);

  // Already not active — idempotent success
  if (idx === -1) {
    return res.json({ success: true, message: "Domain was not activated on this license." });
  }

  license.activeDomains.splice(idx, 1);
  await license.save();

  await LicenseActivation.create({
    licenseId: license._id,
    domain:    normalizedDomain,
    action:    "deactivate",
    actorRole: "plugin",
    ipAddress: req.ip || "",
  });

  await writeAuditLog({
    action:     "license.domain_deactivated",
    targetType: "License",
    targetId:   license._id,
    metadata:   { licenseKey: license.licenseKey, domain: normalizedDomain },
    ip:         req.ip,
  });

  return res.json(safeResponse(license, "Domain deactivated. Slot is now free."));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/plugin/check
// Body: { licenseKey, domain, product }
// Lightweight periodic check — no state change, just validates
// ─────────────────────────────────────────────────────────────────────────────
exports.check = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) return res.status(code).json({ success: false, message: error, valid: false });

  const normalizedDomain = domain ? normalizeDomain(domain) : null;
  let domainValid = true;

  if (normalizedDomain) {
    const isActivated = license.activeDomains.some((d) => d.domain === normalizedDomain);
    if (!isActivated) {
      domainValid = false;
      return res.status(403).json({
        success: false,
        valid: false,
        message: "This domain is not activated for this license.",
        licenseKey: license.licenseKey,
        status: license.status,
      });
    }
  }

  return res.json({
    ...safeResponse(license, "License is valid."),
    valid: true,
    domainValid,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/plugin/replace-domain
// Body: { licenseKey, oldDomain, newDomain, product }
// Atomic staging→production domain swap (deactivate old + activate new in one call)
// ─────────────────────────────────────────────────────────────────────────────
exports.replaceDomain = asyncHandler(async (req, res) => {
  const { licenseKey, oldDomain, newDomain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!oldDomain)  throw new AppError("oldDomain is required.", 422);
  if (!newDomain)  throw new AppError("newDomain is required.", 422);

  const normOld = normalizeDomain(oldDomain);
  const normNew = normalizeDomain(newDomain);

  if (!isValidDomain(normNew)) throw new AppError("Invalid newDomain format.", 422);
  if (normOld === normNew)     throw new AppError("oldDomain and newDomain are the same.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) return res.status(code).json({ success: false, message: error });

  const oldIdx = license.activeDomains.findIndex((d) => d.domain === normOld);
  if (oldIdx === -1) throw new AppError("oldDomain is not activated on this license.", 404);

  // newDomain already active? Just remove old one
  const newAlreadyActive = license.activeDomains.some((d) => d.domain === normNew);
  if (!newAlreadyActive) {
    // Replace in-place (preserves slot count — no limit check needed)
    license.activeDomains[oldIdx] = { domain: normNew, activatedAt: new Date() };
  } else {
    // New domain already active — just remove old
    license.activeDomains.splice(oldIdx, 1);
  }

  await license.save();

  // Log both events
  await LicenseActivation.insertMany([
    { licenseId: license._id, domain: normOld, action: "deactivate", actorRole: "plugin", ipAddress: req.ip || "", note: `replaced by ${normNew}` },
    { licenseId: license._id, domain: normNew, action: "activate",   actorRole: "plugin", ipAddress: req.ip || "", note: `replaced ${normOld}` },
  ]);

  await writeAuditLog({
    action: "license.domain_replaced",
    targetType: "License", targetId: license._id,
    metadata: { licenseKey: license.licenseKey, oldDomain: normOld, newDomain: normNew },
    ip: req.ip,
  });

  return res.json(safeResponse(license, `Domain replaced: ${normOld} → ${normNew}`));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/plugin/update-check
// Body: { licenseKey, domain, product, currentVersion }
// Called periodically by the plugin's built-in updater. Returns whether a
// newer published version exists, and the changelog — but NEVER the actual
// file path or a direct download URL (that still requires the authenticated
// /api/v1/downloads/request flow). This endpoint only powers the
// "Update Available" notice inside the WordPress admin.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCheck = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug, currentVersion } = req.body;

  if (!licenseKey)      throw new AppError("licenseKey is required.", 422);
  if (!currentVersion)  throw new AppError("currentVersion is required.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) {
    return res.status(code).json({ success: false, message: error, updateAvailable: false });
  }

  // Optional: confirm the calling domain is actually activated on this license.
  // Not a hard requirement (some setups poll before activation completes),
  // but flagged in the response so the plugin can warn the site owner.
  let domainActivated = true;
  if (domain) {
    const normalizedDomain = normalizeDomain(domain);
    domainActivated = license.activeDomains.some((d) => d.domain === normalizedDomain);
  }

  const latest = await PluginVersion.findOne({
    productId: license.productId._id,
    isPublished: true,
  });

  if (!latest) {
    return res.json({
      success: true,
      updateAvailable: false,
      message: "No published version found for this product.",
      domainActivated,
    });
  }

  const updateAvailable = isNewerVersion(latest.versionNumber, currentVersion);

  return res.json({
    success: true,
    updateAvailable,
    domainActivated,
    currentVersion,
    latestVersion: latest.versionNumber,
    changelog: updateAvailable ? latest.changelog : "",
    minWpVersion: latest.minWpVersion || null,
    minPhpVersion: latest.minPhpVersion || null,
    releasedAt: latest.releasedAt,
    // No file path / signed URL here by design — see header comment.
  });
});

