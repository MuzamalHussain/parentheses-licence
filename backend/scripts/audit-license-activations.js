require("dotenv").config();
const mongoose = require("mongoose");
const License = require("../src/models/License");
const LicenseSite = require("../src/models/LicenseSite");
const { normalizeDomain } = require("../src/utils/domain");

const apply = process.argv.includes("--apply");

async function run() {
  if (apply && !process.argv.includes("--backup-confirmed")) {
    throw new Error("Refusing to write without --backup-confirmed. Run a database backup first.");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });

  const report = {
    mode: apply ? "apply" : "dry-run",
    scannedLicenses: 0,
    normalizedOrDuplicateDomains: [],
    overLimitLicenses: [],
    orphanedSites: [],
    mirrorMismatches: [],
    repairedLicenses: 0,
  };

  const cursor = License.find({}).select("allowedSites activeDomains productId userId").cursor();
  for await (const license of cursor) {
    report.scannedLicenses += 1;
    const canonical = new Map();
    let changed = false;
    for (const entry of license.activeDomains || []) {
      const domain = normalizeDomain(entry.domain);
      if (domain !== entry.domain || canonical.has(domain)) changed = true;
      if (!canonical.has(domain)) canonical.set(domain, { domain, activatedAt: entry.activatedAt });
    }
    const domains = [...canonical.values()];
    if (changed) {
      report.normalizedOrDuplicateDomains.push({ licenseId: license._id, before: license.activeDomains.length, after: domains.length });
      if (apply) {
        license.activeDomains = domains;
        await license.save();
        report.repairedLicenses += 1;
      }
    }
    if (license.allowedSites > 0 && domains.length > license.allowedSites) {
      report.overLimitLicenses.push({ licenseId: license._id, allowedSites: license.allowedSites, usedSites: domains.length });
    }

    const sites = await LicenseSite.find({ licenseId: license._id }).select("domain status productId userId").lean();
    const activeSiteDomains = new Set(sites.filter((site) => site.status === "active").map((site) => normalizeDomain(site.domain)));
    const embeddedDomains = new Set(domains.map((entry) => entry.domain));
    const onlyEmbedded = [...embeddedDomains].filter((domain) => !activeSiteDomains.has(domain));
    const onlySiteRecords = [...activeSiteDomains].filter((domain) => !embeddedDomains.has(domain));
    if (onlyEmbedded.length || onlySiteRecords.length) {
      report.mirrorMismatches.push({ licenseId: license._id, onlyEmbedded, onlySiteRecords });
    }
  }

  const orphanedSites = await LicenseSite.aggregate([
    { $lookup: { from: "licenses", localField: "licenseId", foreignField: "_id", as: "license" } },
    { $match: { license: { $size: 0 } } },
    { $project: { _id: 1, licenseId: 1, domain: 1, status: 1 } },
  ]);
  report.orphanedSites = orphanedSites;
  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
