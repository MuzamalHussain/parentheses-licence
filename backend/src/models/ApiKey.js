const mongoose = require("mongoose");

const API_KEY_SCOPES = [
  "products.read",
  "products.write",
  "licenses.read",
  "licenses.write",
  "orders.read",
  "orders.write",
  "downloads.read",
  "customers.read",
  "analytics.read",
  "webhooks.write",
  "admin",
];

const apiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    keyPrefix: { type: String, required: true, index: true },
    keyLast4: { type: String, required: true },
    environment: { type: String, enum: ["production", "sandbox"], default: "production", index: true },
    accessType: { type: String, enum: ["read_only", "full_access"], default: "read_only" },
    keyType: { type: String, enum: ["production", "sandbox", "temporary"], default: "production" },
    scopes: { type: [String], enum: API_KEY_SCOPES, default: ["products.read"] },
    status: { type: String, enum: ["active", "revoked", "expired"], default: "active", index: true },
    expiresAt: { type: Date, default: null, index: true },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: "" },
    usageCount: { type: Number, default: 0 },
    rotatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "ApiKey", default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rateLimits: {
      perMinute: { type: Number, default: 120 },
      burst: { type: Number, default: 30 },
      daily: { type: Number, default: 10000 },
    },
  },
  { timestamps: true }
);

apiKeySchema.index({ ownerId: 1, createdAt: -1 });
apiKeySchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("ApiKey", apiKeySchema);
module.exports.API_KEY_SCOPES = API_KEY_SCOPES;
