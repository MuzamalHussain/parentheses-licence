const asyncHandler = require("express-async-handler");
const Marketplace = require("../services/marketplace/ExtensionManager");
const Manifest = require("../services/marketplace/ExtensionManifestService");
const Compatibility = require("../services/marketplace/ExtensionCompatibilityService");
const Permissions = require("../services/marketplace/ExtensionPermissionService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Marketplace.dashboard(), requestId: req.id });
});

exports.catalog = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Marketplace.registry.browse(), requestId: req.id });
});

exports.installed = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Marketplace.registry.listInstalled(), requestId: req.id });
});

exports.validateManifest = asyncHandler(async (req, res) => {
  const manifest = Manifest.validate(req.body || {});
  const permissionValidation = Permissions.validatePermissions(manifest.manifest.permissions);
  const compatibility = Compatibility.validate(manifest.manifest, Marketplace.registry.listInstalled());
  res.json({ success: manifest.valid && permissionValidation.valid && compatibility.compatible, data: { manifest, permissionValidation, compatibility }, requestId: req.id });
});

exports.addToCatalog = asyncHandler(async (req, res) => {
  const result = Marketplace.addToCatalog(req.body || {});
  res.status(result.valid ? 201 : 422).json({ success: result.valid, data: result, requestId: req.id });
});

exports.lifecycle = asyncHandler(async (req, res) => {
  const { id, action } = req.params;
  const body = req.body || {};
  const service = Marketplace.lifecycle;
  let data;
  if (action === "install") data = await service.install(id, context(req));
  else if (action === "enable") data = await service.enable(id, context(req));
  else if (action === "disable") data = await service.disable(id, context(req));
  else if (action === "update") data = await service.update(id, body, context(req));
  else if (action === "rollback") data = await service.rollback(id, context(req));
  else if (action === "uninstall") data = await service.uninstall(id, context(req));
  else if (action === "grant-permission") data = await service.grantPermission(id, body.permissions || [], context(req));
  else if (action === "revoke-permission") data = await service.revokePermission(id, body.permissions || [], context(req));
  else {
    const err = new Error("Unsupported extension action.");
    err.statusCode = 422;
    throw err;
  }
  res.json({ success: true, data, requestId: req.id });
});

exports.sdk = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Marketplace.sdk.describe(), requestId: req.id });
});
