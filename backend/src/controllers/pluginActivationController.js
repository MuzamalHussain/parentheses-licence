const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const LicenseActivation = require("../models/LicenseActivation");
const PluginVersion = require("../models/PluginVersion");
const { AppError } = require("../utils/errorHandler");
const { normalizeDomain, isValidDomain } = require("../utils/domain");
const { writeAuditLog } = require("../utils/auditLog");
const { isNewerVersion } = require("../utils/semver");

const populateLicenseForPlugin = (query) =>
  query
    .populate("productId", "name slug status")
    .populate("planId", "name allowedSites");

async function resolveLicense(licenseKey, productSlug) {
  const license = await populateLicenseForPlugin(License.findOne({ licenseKey }));

  if (!license) return { error: "License key not found.", code: 404 };
  if (license.status === "revoked") return { error: "This license has been revoked.", code: 403 };
  if (license.status === "suspended") return { error: "This license is currently suspended. Contact support.", code: 403 };
  if (license.status === "expired") return { error: "This license has expired.", code: 403 };

  if (license.expiresAt && new Date() > license.expiresAt) {
    license.status = "expired";
    await license.save({ validateBeforeSave: false });
    return { error: "This license has expired.", code: 403 };
  }

  if (productSlug && license.productId?.slug !== productSlug) {
    return { error: "This license key is not valid for this product.", code: 403 };
  }

  if (license.productId?.status === "archived") {
    return { error: "This product is no longer available.", code: 403 };
  }

  return { license };
}

function safeResponse(license, message) {
  return {
    success: true,
    message,
    licenseKey: license.licenseKey,
    status: license.status,
    product: license.productId?.name,
    plan: license.planId?.name,
    allowedSites: license.allowedSites === 0 ? "unlimited" : license.allowedSites,
    usedSites: license.activeDomains.length,
    expiresAt: license.expiresAt || null,
    activeDomains: license.activeDomains.map((d) => d.domain),
  };
}

function maskLicenseKey(licenseKey = "") {
  const compact = String(licenseKey).replace(/-/g, "");
  if (compact.length <= 8) return "****";
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

async function reloadLicenseForResponse(licenseId) {
  return populateLicenseForPlugin(License.findById(licenseId));
}

function limitExceededResponse(res, license) {
  const siteLimit = license.allowedSites;
  return res.status(403).json({
    success: false,
    message: `Site limit reached (${siteLimit} site${siteLimit !== 1 ? "s" : ""} allowed). Deactivate another domain first.`,
    allowedSites: siteLimit,
    usedSites: license.activeDomains.length,
    activeDomains: license.activeDomains.map((d) => d.domain),
  });
}

exports.activate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) throw new AppError("Invalid domain format.", 422);

  const normalizedKey = licenseKey.toUpperCase().trim();
  console.log("[License Activation]", {
    status: "requested",
    license: maskLicenseKey(normalizedKey),
    domain: normalizedDomain,
  });

  const { license, error, code } = await resolveLicense(normalizedKey, productSlug);
  if (error) return res.status(code).json({ success: false, message: error });

  if (license.activeDomains.some((d) => d.domain === normalizedDomain)) {
    console.log("[License Activation]", {
      status: "already_active",
      license: maskLicenseKey(normalizedKey),
      domain: normalizedDomain,
    });
    return res.json(safeResponse(license, "License is already active on this domain."));
  }

  const activatedAt = new Date();
  const updatedLicense = await License.findOneAndUpdate(
    {
      _id: license._id,
      status: "active",
      "activeDomains.domain": { $ne: normalizedDomain },
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: activatedAt } }] },
        {
          $or: [
            { allowedSites: 0 },
            { $expr: { $lt: [{ $size: "$activeDomains" }, "$allowedSites"] } },
          ],
        },
      ],
    },
    {
      $push: { activeDomains: { domain: normalizedDomain, activatedAt } },
    },
    { new: true, runValidators: true }
  );

  if (!updatedLicense) {
    const latest = await reloadLicenseForResponse(license._id);
    if (!latest) return res.status(404).json({ success: false, message: "License key not found." });

    if (latest.activeDomains.some((d) => d.domain === normalizedDomain)) {
      console.log("[License Activation]", {
        status: "already_active_after_race",
        license: maskLicenseKey(normalizedKey),
        domain: normalizedDomain,
      });
      return res.json(safeResponse(latest, "License is already active on this domain."));
    }

    if (latest.status === "suspended") {
      return res.status(403).json({ success: false, message: "This license is currently suspended. Contact support." });
    }
    if (latest.status === "revoked") {
      return res.status(403).json({ success: false, message: "This license has been revoked." });
    }
    if (latest.status === "expired" || (latest.expiresAt && new Date() > latest.expiresAt)) {
      return res.status(403).json({ success: false, message: "This license has expired." });
    }

    console.log("[License Activation]", {
      status: "limit_exceeded",
      license: maskLicenseKey(normalizedKey),
      domain: normalizedDomain,
      allowedSites: latest.allowedSites,
      usedSites: latest.activeDomains.length,
    });
    return limitExceededResponse(res, latest);
  }

  await LicenseActivation.create({
    licenseId: updatedLicense._id,
    domain: normalizedDomain,
    action: "activate",
    actorRole: "plugin",
    ipAddress: req.ip || "",
  });

  await writeAuditLog({
    action: "license.domain_activated",
    targetType: "License",
    targetId: updatedLicense._id,
    metadata: { licenseKey: updatedLicense.licenseKey, domain: normalizedDomain },
    ip: req.ip,
  });

  console.log("[License Activation]", {
    status: "created",
    license: maskLicenseKey(normalizedKey),
    domain: normalizedDomain,
  });

  const responseLicense = await reloadLicenseForResponse(updatedLicense._id);
  return res.status(201).json(safeResponse(responseLicense, "License activated successfully."));
});

exports.deactivate = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!domain) throw new AppError("domain is required.", 422);

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) throw new AppError("Invalid domain format.", 422);

  const normalizedKey = licenseKey.toUpperCase().trim();
  const { license, error, code } = await resolveLicense(normalizedKey, productSlug);

  if (error && code !== 403) {
    return res.status(code).json({ success: false, message: error });
  }
  if (!license) {
    return res.status(code).json({ success: false, message: error });
  }

  const updatedLicense = await License.findOneAndUpdate(
    { _id: license._id, "activeDomains.domain": normalizedDomain },
    { $pull: { activeDomains: { domain: normalizedDomain } } },
    { new: true }
  );

  if (!updatedLicense) {
    return res.json({ success: true, message: "Domain was not activated on this license." });
  }

  await LicenseActivation.create({
    licenseId: updatedLicense._id,
    domain: normalizedDomain,
    action: "deactivate",
    actorRole: "plugin",
    ipAddress: req.ip || "",
  });

  await writeAuditLog({
    action: "license.domain_deactivated",
    targetType: "License",
    targetId: updatedLicense._id,
    metadata: { licenseKey: updatedLicense.licenseKey, domain: normalizedDomain },
    ip: req.ip,
  });

  const responseLicense = await reloadLicenseForResponse(updatedLicense._id);
  return res.json(safeResponse(responseLicense, "Domain deactivated. Slot is now free."));
});

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

exports.replaceDomain = asyncHandler(async (req, res) => {
  const { licenseKey, oldDomain, newDomain, product: productSlug } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!oldDomain) throw new AppError("oldDomain is required.", 422);
  if (!newDomain) throw new AppError("newDomain is required.", 422);

  const normOld = normalizeDomain(oldDomain);
  const normNew = normalizeDomain(newDomain);

  if (!isValidDomain(normNew)) throw new AppError("Invalid newDomain format.", 422);
  if (normOld === normNew) throw new AppError("oldDomain and newDomain are the same.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) return res.status(code).json({ success: false, message: error });

  const oldIdx = license.activeDomains.findIndex((d) => d.domain === normOld);
  if (oldIdx === -1) throw new AppError("oldDomain is not activated on this license.", 404);

  const newAlreadyActive = license.activeDomains.some((d) => d.domain === normNew);
  if (!newAlreadyActive) {
    license.activeDomains[oldIdx] = { domain: normNew, activatedAt: new Date() };
  } else {
    license.activeDomains.splice(oldIdx, 1);
  }

  await license.save();

  await LicenseActivation.insertMany([
    { licenseId: license._id, domain: normOld, action: "deactivate", actorRole: "plugin", ipAddress: req.ip || "", note: `replaced by ${normNew}` },
    { licenseId: license._id, domain: normNew, action: "activate", actorRole: "plugin", ipAddress: req.ip || "", note: `replaced ${normOld}` },
  ]);

  await writeAuditLog({
    action: "license.domain_replaced",
    targetType: "License",
    targetId: license._id,
    metadata: { licenseKey: license.licenseKey, oldDomain: normOld, newDomain: normNew },
    ip: req.ip,
  });

  return res.json(safeResponse(license, `Domain replaced: ${normOld} -> ${normNew}`));
});

exports.updateCheck = asyncHandler(async (req, res) => {
  const { licenseKey, domain, product: productSlug, currentVersion } = req.body;

  if (!licenseKey) throw new AppError("licenseKey is required.", 422);
  if (!currentVersion) throw new AppError("currentVersion is required.", 422);

  const { license, error, code } = await resolveLicense(
    licenseKey.toUpperCase().trim(),
    productSlug
  );
  if (error) {
    return res.status(code).json({ success: false, message: error, updateAvailable: false });
  }

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
  });
});

exports._private = {
  limitExceededResponse,
  maskLicenseKey,
  safeResponse,
};
