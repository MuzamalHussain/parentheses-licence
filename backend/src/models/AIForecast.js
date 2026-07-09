const mongoose = require("mongoose");

const aiForecastSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    forecastType: {
      type: String,
      enum: ["executive", "revenue", "renewal", "customer_health", "capacity", "product", "support"],
      default: "executive",
      index: true,
    },
    historicalWindowDays: { type: Number, min: 1, default: 90 },
    forecastWindowDays: { type: Number, min: 1, default: 30 },
    revenueForecast: { type: mongoose.Schema.Types.Mixed, default: {} },
    licenseForecast: { type: mongoose.Schema.Types.Mixed, default: {} },
    customerHealth: { type: mongoose.Schema.Types.Mixed, default: {} },
    churnAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    productForecast: { type: mongoose.Schema.Types.Mixed, default: {} },
    supportForecast: { type: mongoose.Schema.Types.Mixed, default: {} },
    capacityForecast: { type: mongoose.Schema.Types.Mixed, default: {} },
    recommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    explainability: { type: mongoose.Schema.Types.Mixed, default: {} },
    visualization: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidenceScore: { type: Number, min: 0, max: 100, default: 0 },
  },
  { timestamps: true }
);

aiForecastSchema.index({ organizationId: 1, forecastType: 1, createdAt: -1 });

module.exports = mongoose.model("AIForecast", aiForecastSchema);
