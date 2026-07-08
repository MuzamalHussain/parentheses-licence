const mongoose = require("mongoose");

const consentRecordSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["marketing", "privacy_policy", "data_sharing", "terms"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["granted", "withdrawn"],
      required: true,
      index: true,
    },
    version: { type: String, trim: true, maxlength: 50, default: "1.0" },
    source: { type: String, trim: true, maxlength: 120, default: "customer_portal" },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

consentRecordSchema.index({ organizationId: 1, userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("ConsentRecord", consentRecordSchema);
