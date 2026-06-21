const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const PluginVersion = require("../models/PluginVersion");
const { AppError } = require("../utils/errorHandler");

// GET /api/v1/products/:productId/versions  (customer — entitlement-gated)
// Requires the customer to hold at least one license for this product.
exports.getMyAvailableVersions = asyncHandler(async (req, res) => {
  const hasLicense = await License.exists({ userId: req.user._id, productId: req.params.productId });
  if (!hasLicense) throw new AppError("You don't have a license for this product.", 403);

  const versions = await PluginVersion.find({ productId: req.params.productId, isPublished: true })
    .sort({ createdAt: -1 })
    .select("-zipFilePath -checksum"); // never leak internal storage path

  // Also include unpublished-but-previously-published history? No — customers
  // only ever see the published version plus older releases is intentionally
  // out of scope for MVP (changelog of "latest" is enough); full version
  // history for customers can be added later if needed. For now we show all
  // *published OR previously published* (i.e. any version that has a releasedAt).
  const history = await PluginVersion.find({
    productId: req.params.productId,
    releasedAt: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select("-zipFilePath -checksum")
    .limit(20);

  res.json({ success: true, data: { latest: versions[0] || null, history } });
});
