function mapCounts(rows = [], defaults = {}) {
  const out = { ...defaults };
  for (const row of rows || []) {
    if (row?._id != null) out[row._id] = row.count || 0;
  }
  return out;
}

function revenueSummary(rows = []) {
  const byCurrency = {};
  let orders = 0;
  for (const row of rows || []) {
    byCurrency[row._id || "USD"] = row.total || 0;
    orders += row.count || 0;
  }
  const primary = byCurrency.USD ?? Object.values(byCurrency)[0] ?? 0;
  return { byCurrency, primary, orders };
}

function executive(raw, filter) {
  const revenue = revenueSummary(raw.revenue);
  const orders = mapCounts(raw.orderStatuses, { draft: 0, pending: 0, processing: 0, completed: 0, paid: 0, cancelled: 0, failed: 0, refunded: 0 });
  const licenses = mapCounts(raw.licenseStatuses, { active: 0, expired: 0, suspended: 0, revoked: 0, lifetime: 0, trial: 0 });
  licenses.total = Object.values(licenses).reduce((sum, count) => sum + count, 0);
  const downloads = mapCounts(raw.downloads, { requested: 0, authorized: 0, completed: 0, denied: 0 });
  const customerCounts = raw.customerCounts?.[0] || { total: 0, newInRange: 0 };
  return {
    filter,
    revenue,
    orders,
    customers: { total: customerCounts.total || 0, newInRange: customerCounts.newInRange || 0 },
    licenses,
    downloads: { ...downloads, total: Object.values(downloads).reduce((sum, count) => sum + count, 0) },
    renewals: { count: raw.renewals?.[0]?.count || 0 },
    growth: raw.growth || [],
    widgets: [
      { key: "revenue", label: "Revenue", value: revenue.primary, format: "currency" },
      { key: "orders", label: "Orders", value: revenue.orders },
      { key: "customers", label: "Customers", value: customerCounts.total || 0 },
      { key: "licenses", label: "Licenses", value: licenses.total },
      { key: "downloads", label: "Downloads", value: Object.values(downloads).reduce((sum, count) => sum + count, 0) },
      { key: "renewals", label: "Renewals", value: raw.renewals?.[0]?.count || 0 },
    ],
    exports: { csv: true, excel: true, pdf: true, scheduledReports: true },
  };
}

function products(raw, filter) {
  const by = (rows, key) => new Map((rows || []).map((row) => [String(row._id), row[key] || 0]));
  const sales = by(raw.sales, "sales");
  const revenue = new Map((raw.sales || []).map((row) => [String(row._id), row.revenue || 0]));
  const downloads = by(raw.downloads, "downloads");
  const licenses = by(raw.licenses, "licenses");
  const sites = by(raw.activeSites, "activeSites");
  const renewals = by(raw.renewals, "renewals");
  const latest = new Map((raw.latestVersions || []).map((v) => [String(v.productId), v]));
  return {
    filter,
    products: (raw.products || []).map((product) => {
      const id = String(product._id);
      return {
        product,
        sales: sales.get(id) || 0,
        revenue: revenue.get(id) || 0,
        downloads: downloads.get(id) || 0,
        licenses: licenses.get(id) || 0,
        activeSites: sites.get(id) || 0,
        renewals: renewals.get(id) || 0,
        latestVersion: latest.get(id) || null,
      };
    }),
  };
}

function versions(raw, filter) {
  const downloads = new Map((raw.downloads || []).map((row) => [String(row._id), row.downloads || 0]));
  const active = new Map((raw.activeInstallations || []).map((row) => [String(row._id), row.activeInstallations || 0]));
  return {
    filter,
    currentStableVersion: raw.stable || null,
    versions: (raw.versions || []).map((version) => ({
      version,
      downloads: downloads.get(String(version._id)) || version.downloadCount || 0,
      activeInstallations: active.get(String(version.versionNumber)) || 0,
      upgradeAdoption: active.get(String(version.versionNumber)) || 0,
    })),
  };
}

function customers(raw, filter) {
  return {
    filter,
    newCustomers: raw.newCustomers || 0,
    activeCustomers: raw.activeCustomers || 0,
    returningCustomers: raw.returningCustomers?.[0]?.count || 0,
    topCustomers: raw.topCustomers || [],
    growth: raw.growth || [],
  };
}

function licenses(raw, filter) {
  const counts = mapCounts(raw, { active: 0, expired: 0, suspended: 0, revoked: 0, lifetime: 0, trial: 0 });
  counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { filter, statuses: counts };
}

function payments(raw, filter) {
  const counts = mapCounts(raw, { pending: 0, authorized: 0, succeeded: 0, failed: 0, cancelled: 0, refunded: 0, partially_refunded: 0 });
  const totalAmount = (raw || []).reduce((sum, row) => sum + (row.amount || 0), 0);
  const successful = (raw || []).find((row) => row._id === "succeeded");
  return {
    filter,
    statuses: counts,
    averageOrderValue: successful?.count ? (successful.amount || 0) / successful.count : 0,
    totalAmount,
  };
}

function downloads(raw, filter) {
  return {
    filter,
    byProduct: raw.byProduct || [],
    byVersion: raw.byVersion || [],
    byDate: raw.byDate || [],
  };
}

module.exports = { executive, products, versions, customers, licenses, payments, downloads, mapCounts, revenueSummary };
