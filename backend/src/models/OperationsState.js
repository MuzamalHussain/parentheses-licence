const mongoose = require("mongoose");

const operationsStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    maintenanceMode: { type: Boolean, default: false },
    readOnlyMode: { type: Boolean, default: false },
    lastAction: { type: String, default: "" },
    lastActionAt: { type: Date, default: null },
    lastActionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OperationsState", operationsStateSchema);
