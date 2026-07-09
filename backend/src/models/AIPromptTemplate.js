const mongoose = require("mongoose");

const aiPromptTemplateSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    key: { type: String, required: true, trim: true, maxlength: 140 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: {
      type: String,
      enum: ["support", "licensing", "payments", "analytics", "fraud", "automation", "developer", "documentation", "general"],
      default: "general",
      index: true,
    },
    type: { type: String, enum: ["system", "template", "component"], default: "template" },
    version: { type: String, trim: true, maxlength: 40, default: "1.0.0" },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft", index: true },
    content: { type: String, required: true, maxlength: 20000 },
    variables: { type: [String], default: [] },
    components: { type: [String], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

aiPromptTemplateSchema.index({ organizationId: 1, key: 1, version: 1 }, { unique: true });
aiPromptTemplateSchema.index({ organizationId: 1, category: 1, status: 1 });

module.exports = mongoose.model("AIPromptTemplate", aiPromptTemplateSchema);
