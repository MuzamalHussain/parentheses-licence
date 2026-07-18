const mongoose = require("mongoose");

const aiProviderConfigSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    providerId: {
      type: String,
      enum: ["openai", "anthropic", "gemini", "groq", "deepseek", "ollama", "local_ai", "openrouter", "azure_openai"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ["configured", "disabled", "error", "pending"], default: "pending", index: true },
    baseUrl: { type: String, trim: true, maxlength: 500, default: "" },
    encryptedApiKey: { type: String, select: false, default: "" },
    apiKeyFingerprint: { type: String, default: "" },
    timeoutMs: { type: Number, min: 1000, max: 300000, default: 30000 },
    retries: { type: Number, min: 0, max: 10, default: 2 },
    temperature: { type: Number, min: 0, max: 2, default: 0.2 },
    maxTokens: { type: Number, min: 1, max: 200000, default: 4096 },
    streamingEnabled: { type: Boolean, default: false },
    fallbackOrder: { type: Number, min: 0, default: 100 },
    capabilities: { type: [String], default: [] },
    health: {
      status: { type: String, enum: ["unknown", "healthy", "degraded", "unavailable"], default: "unknown" },
      lastCheckedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

aiProviderConfigSchema.index({ organizationId: 1, providerId: 1 }, { unique: true });
aiProviderConfigSchema.index({ organizationId: 1, status: 1, fallbackOrder: 1 });

module.exports = mongoose.model("AIProviderConfig", aiProviderConfigSchema);
