const mongoose = require("mongoose");

const aiConversationMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    contextSummary: { type: String, default: "", maxlength: 10000 },
    providerId: { type: String, default: "" },
    modelId: { type: String, default: "" },
    promptTokens: { type: Number, min: 0, default: 0 },
    completionTokens: { type: Number, min: 0, default: 0 },
    totalTokens: { type: Number, min: 0, default: 0 },
    estimatedCost: { type: Number, min: 0, default: 0 },
    suggestedActions: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: true }
);

const aiConversationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    audience: { type: String, enum: ["customer", "admin"], default: "customer", index: true },
    title: { type: String, trim: true, maxlength: 160, default: "AI Assistant Conversation" },
    status: { type: String, enum: ["open", "archived"], default: "open", index: true },
    category: {
      type: String,
      enum: ["license", "activation", "download", "renewal", "payments", "orders", "account", "version", "customers", "analytics", "organizations", "general"],
      default: "general",
      index: true,
    },
    messages: { type: [aiConversationMessageSchema], default: [] },
    lastProviderId: { type: String, default: "" },
    lastModelId: { type: String, default: "" },
    totalPromptTokens: { type: Number, min: 0, default: 0 },
    totalCompletionTokens: { type: Number, min: 0, default: 0 },
    totalEstimatedCost: { type: Number, min: 0, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

aiConversationSchema.index({ organizationId: 1, audience: 1, lastMessageAt: -1 });
aiConversationSchema.index({ userId: 1, lastMessageAt: -1 });

module.exports = mongoose.model("AIConversation", aiConversationSchema);
