const asyncHandler = require("express-async-handler");
const License = require("../models/License");
const PluginVersion = require("../models/PluginVersion");
const { AppError } = require("../utils/errorHandler");
const { eligibleChannelsFor, publicVersionPayload } = require("../services/downloadDistributionService");

// GET /api/v1/products/:productId/versions  (customer — entitlement-gated)
// Requires the customer to hold at least one license for this product.
exports.getMyAvailableVersions = asyncHandler(async (req, res) => {
  const license = await License.findOne({ userId: req.user._id, productId: req.params.productId })
    .populate("productId", "defaultReleaseChannel betaEnabled alphaEnabled")
    .lean();
  if (!license) throw new AppError("You don't have a license for this product.", 403);
  const channels = eligibleChannelsFor(license, license.productId);

  const versions = await PluginVersion.find({
    productId: req.params.productId,
    isPublished: true,
    releaseChannel: { $in: channels },
  })
    .sort({ createdAt: -1 })
    .select("-zipFilePath -assets.path")
    .lean(); // never leak internal storage paths

  // Also include unpublished-but-previously-published history? No — customers
  // only ever see the published version plus older releases is intentionally
  // out of scope for MVP (changelog of "latest" is enough); full version
  // history for customers can be added later if needed. For now we show all
  // *published OR previously published* (i.e. any version that has a releasedAt).
  const history = await PluginVersion.find({
    productId: req.params.productId,
    releasedAt: { $ne: null },
    releaseChannel: { $in: channels },
  })
    .sort({ createdAt: -1 })
    .select("-zipFilePath -assets.path")
    .limit(20)
    .lean();

  res.json({
    success: true,
    data: {
      latest: versions[0] ? publicVersionPayload(versions[0]) : null,
      history: history.map(publicVersionPayload),
      eligibleChannels: channels,
    },
  });
});
