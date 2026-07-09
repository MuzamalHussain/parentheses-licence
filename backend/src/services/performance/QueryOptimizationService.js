const mongoose = require("mongoose");

const recommendedIndexes = [
  { model: "License", fields: ["organizationId", "customerId", "status", "expiresAt"], reason: "license dashboards and validation filters" },
  { model: "Order", fields: ["organizationId", "customerId", "status", "createdAt"], reason: "order center filtering and analytics" },
  { model: "Download", fields: ["organizationId", "productId", "versionId", "createdAt"], reason: "download analytics and history" },
  { model: "LicenseSite", fields: ["licenseId", "domain", "status"], reason: "activation duplicate detection and heartbeat lookup" },
  { model: "AuditLog", fields: ["actorId", "action", "createdAt"], reason: "admin audit filtering" },
];

function modelIndexNames(modelName) {
  const model = mongoose.models[modelName];
  if (!model?.schema) return [];
  return model.schema.indexes().map(([fields]) => Object.keys(fields).join("_"));
}

function analyzeMissingIndexes() {
  return recommendedIndexes.map((item) => {
    const existing = modelIndexNames(item.model);
    const expected = item.fields.join("_");
    return { ...item, expected, present: existing.includes(expected), existing };
  });
}

function analyze() {
  const connected = mongoose.connection.readyState === 1;
  return {
    connected,
    slowQueryDetection: true,
    duplicateQueryDetection: "foundation",
    nPlusOneDetection: "foundation",
    largePayloadDetection: true,
    missingIndexes: analyzeMissingIndexes(),
    recommendations: [
      "Use lean queries for read-only dashboard lists.",
      "Prefer aggregation pipelines for dashboard counts.",
      "Add compound indexes before high-volume production imports.",
      "Project only fields needed by admin tables and customer dashboards.",
    ],
  };
}

module.exports = { analyze };
