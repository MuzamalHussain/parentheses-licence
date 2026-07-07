const User = require("../../models/User");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const License = require("../../models/License");
const Download = require("../../models/Download");
const PluginVersion = require("../../models/PluginVersion");
const LicenseSite = require("../../models/LicenseSite");

function range(field, filter) {
  return { [field]: { $gte: filter.start, $lte: filter.end } };
}

const paidStatuses = ["paid", "completed"];

async function fetchExecutive(filter) {
  const [
    revenue,
    orderStatuses,
    customerCounts,
    licenseStatuses,
    downloads,
    renewals,
    growth,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $in: paidStatuses }, ...range("createdAt", filter) } },
      { $group: { _id: "$currency", total: { $sum: { $ifNull: ["$grandTotal", "$amount"] } }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: range("createdAt", filter) },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: { $ifNull: ["$grandTotal", "$amount"] } } } },
    ]),
    User.aggregate([
      { $match: { role: "customer" } },
      { $group: { _id: null, total: { $sum: 1 }, newInRange: { $sum: { $cond: [{ $and: [{ $gte: ["$createdAt", filter.start] }, { $lte: ["$createdAt", filter.end] }] }, 1, 0] } } } },
    ]),
    License.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    License.aggregate([{ $match: { "renewalHistory.0": { $exists: true } } }, { $project: { renewalHistory: 1 } }, { $unwind: "$renewalHistory" }, { $match: { "renewalHistory.renewedAt": { $gte: filter.start, $lte: filter.end } } }, { $count: "count" }]),
    User.aggregate([
      { $match: { role: "customer", ...range("createdAt", filter) } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return { revenue, orderStatuses, customerCounts, licenseStatuses, downloads, renewals, growth };
}

async function fetchProductAnalytics(filter) {
  const [products, sales, downloads, licenses, activeSites, renewals, latestVersions] = await Promise.all([
    Product.find({}).select("name slug status").lean(),
    Order.aggregate([
      { $match: { status: { $in: paidStatuses }, ...range("createdAt", filter) } },
      { $group: { _id: "$productId", sales: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$grandTotal", "$amount"] } } } },
    ]),
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: "$productId", downloads: { $sum: 1 } } }]),
    License.aggregate([{ $group: { _id: "$productId", licenses: { $sum: 1 } } }]),
    LicenseSite.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$productId", activeSites: { $sum: 1 } } }]),
    License.aggregate([{ $project: { productId: 1, renewalHistory: 1 } }, { $unwind: "$renewalHistory" }, { $match: { "renewalHistory.renewedAt": { $gte: filter.start, $lte: filter.end } } }, { $group: { _id: "$productId", renewals: { $sum: 1 } } }]),
    PluginVersion.find({ isLatest: true }).select("productId versionNumber releaseChannel releasedAt").lean(),
  ]);
  return { products, sales, downloads, licenses, activeSites, renewals, latestVersions };
}

async function fetchVersionAnalytics(filter) {
  const [versions, downloads, activeInstallations, stable] = await Promise.all([
    PluginVersion.find({}).select("productId versionNumber isLatest isPublished releaseChannel downloadCount releasedAt").lean(),
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: "$pluginVersionId", downloads: { $sum: 1 } } }]),
    LicenseSite.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$pluginVersion", activeInstallations: { $sum: 1 } } }]),
    PluginVersion.findOne({ isLatest: true, releaseChannel: "stable" }).select("productId versionNumber releasedAt").lean(),
  ]);
  return { versions, downloads, activeInstallations, stable };
}

async function fetchCustomerAnalytics(filter) {
  const [newCustomers, activeCustomers, returningCustomers, topCustomers, growth] = await Promise.all([
    User.countDocuments({ role: "customer", ...range("createdAt", filter) }),
    Order.distinct("userId", { status: { $in: paidStatuses }, ...range("createdAt", filter) }),
    Order.aggregate([{ $match: { status: { $in: paidStatuses } } }, { $group: { _id: "$userId", orders: { $sum: 1 } } }, { $match: { orders: { $gt: 1 } } }, { $count: "count" }]),
    Order.aggregate([
      { $match: { status: { $in: paidStatuses } } },
      { $group: { _id: "$userId", orders: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$grandTotal", "$amount"] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $project: { orders: 1, revenue: 1, name: "$user.name", email: "$user.email" } },
    ]),
    User.aggregate([{ $match: { role: "customer", ...range("createdAt", filter) } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return { newCustomers, activeCustomers: activeCustomers.length, returningCustomers, topCustomers, growth };
}

async function fetchLicenseAnalytics() {
  return License.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
}

async function fetchPaymentAnalytics(filter) {
  return Payment.aggregate([
    { $match: range("createdAt", filter) },
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);
}

async function fetchDownloadAnalytics(filter) {
  const [byProduct, byVersion, byDate] = await Promise.all([
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: "$productId", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: "$pluginVersionId", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Download.aggregate([{ $match: range("createdAt", filter) }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return { byProduct, byVersion, byDate };
}

module.exports = {
  fetchExecutive,
  fetchProductAnalytics,
  fetchVersionAnalytics,
  fetchCustomerAnalytics,
  fetchLicenseAnalytics,
  fetchPaymentAnalytics,
  fetchDownloadAnalytics,
};
