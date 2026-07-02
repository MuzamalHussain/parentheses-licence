const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
      // percentage: 0-100, fixed: currency amount (interpreted in the order's own currency)
    },
    maxUses: {
      type: Number,
      default: null, // null = unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: null, // null = never expires
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1, createdAt: -1 });
couponSchema.index({ expiresAt: 1 }, { sparse: true });

couponSchema.methods.isValid = function () {
  if (!this.isActive) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
  return true;
};

couponSchema.methods.computeDiscount = function (amount) {
  if (this.type === "percentage") return Math.round((amount * this.value) / 100 * 100) / 100;
  return Math.min(this.value, amount); // fixed discount never exceeds the order amount
};

module.exports = mongoose.model("Coupon", couponSchema);
