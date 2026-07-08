const asyncHandler = require("express-async-handler");
const BrandingService = require("../services/branding/BrandingService");

function context(req) {
  return { actor: req.user, ip: req.ip, requestId: req.id };
}

exports.publicBrand = asyncHandler(async (req, res) => {
  const data = await BrandingService.getBrandForRequest({
    organizationId: req.query.organizationId,
    host: req.hostname,
  });
  res.json({ success: true, data });
});

exports.getBrand = asyncHandler(async (req, res) => {
  const data = await BrandingService.getBrand(req.params.organizationId);
  res.json({ success: true, data });
});

exports.updateBrand = asyncHandler(async (req, res) => {
  const data = await BrandingService.updateBrand(req.params.organizationId, req.body, context(req));
  res.json({ success: true, message: "Brand updated.", data });
});

exports.updateAsset = asyncHandler(async (req, res) => {
  const data = await BrandingService.updateAsset(req.params.organizationId, req.params.field, req.body, context(req));
  res.json({ success: true, message: "Brand asset updated.", data });
});

exports.resetBrand = asyncHandler(async (req, res) => {
  const data = await BrandingService.resetBrand(req.params.organizationId, context(req));
  res.json({ success: true, message: "Brand reset.", data });
});
