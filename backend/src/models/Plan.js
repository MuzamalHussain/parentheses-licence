const mongoose = require("mongoose");
const { RENEWAL_TYPE } = require("../utils/constants");

const planSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Plan must belong to a product"],
    },
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      maxlength: 100,
    },
    allowedSites: {
      type: Number,
      required: [true, "Allowed sites is required"],
      min: [0, "Allowed sites cannot be negative"],
      // 0 = unlimited, by convention
    },
    planType: {
      type: String,
      enum: ["single_site", "3_sites", "5_sites", "10_sites", "agency", "unlimited", "lifetime", "trial", "custom"],
      default: "single_site",
      index: true,
    },
    upgradeRank: {
      type: Number,
      default: 1,
      min: 0,
    },
    priceUSD: {
      type: Number,
      required: [true, "USD price is required"],
      min: 0,
    },
    priceLocal: {
      type: Number,
      required: [true, "Local (PKR) price is required"],
      min: 0,
    },
    durationDays: {
      type: Number,
      default: 365,
      min: 0,
      // null/0 can represent lifetime depending on renewalType
    },
    renewalType: {
      type: String,
      enum: Object.values(RENEWAL_TYPE),
      default: RENEWAL_TYPE.RECURRING,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

planSchema.index({ productId: 1 });
planSchema.index({ productId: 1, isActive: 1 });
planSchema.index({ productId: 1, planType: 1, isActive: 1 });

module.exports = mongoose.model("Plan", planSchema);
