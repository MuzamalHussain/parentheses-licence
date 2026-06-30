require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Payment = require("../src/models/Payment");
const License = require("../src/models/License");

async function findDuplicatePayments() {
  return Payment.aggregate([
    { $match: { gatewayTransactionId: { $type: "string", $ne: "" } } },
    {
      $group: {
        _id: { gateway: "$gateway", gatewayTransactionId: "$gatewayTransactionId" },
        count: { $sum: 1 },
        ids: { $push: "$_id" },
        orderIds: { $addToSet: "$orderId" },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
}

async function findDuplicateLicenses() {
  return License.aggregate([
    { $match: { orderId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$orderId",
        count: { $sum: 1 },
        ids: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
}

async function main() {
  await connectDB();

  const [duplicatePayments, duplicateLicenses] = await Promise.all([
    findDuplicatePayments(),
    findDuplicateLicenses(),
  ]);

  if (duplicatePayments.length) {
    console.error("Duplicate payment gateway references found:");
    duplicatePayments.forEach((row) => {
      console.error(JSON.stringify(row));
    });
  }

  if (duplicateLicenses.length) {
    console.error("Duplicate licenses for the same order found:");
    duplicateLicenses.forEach((row) => {
      console.error(JSON.stringify(row));
    });
  }

  if (duplicatePayments.length || duplicateLicenses.length) {
    console.error("Phase 7C duplicate preflight failed. Resolve duplicates before creating unique indexes.");
    process.exitCode = 1;
  } else {
    console.log("Phase 7C duplicate preflight passed. No duplicate payment refs or order licenses found.");
  }
}

main()
  .catch((err) => {
    console.error("Phase 7C duplicate preflight failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
