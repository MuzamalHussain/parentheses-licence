function riskLevel(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function evidence(source, message, value = null) {
  return { source, message, value };
}

function assess({ releaseAnalysis, compatibility }) {
  const ev = [];
  let score = 0;
  const sections = releaseAnalysis.changelog.sections;
  if (sections.breakingChanges.present) {
    score += 35;
    ev.push(evidence("changelog", "Breaking changes are documented.", sections.breakingChanges.summary));
  }
  if (sections.securityFixes.present) {
    score += 15;
    ev.push(evidence("changelog", "Security fixes are included.", sections.securityFixes.summary));
  }
  if (releaseAnalysis.releaseMetadata.validationStatus === "failed") {
    score += 45;
    ev.push(evidence("release_pipeline", "Pipeline validation failed.", releaseAnalysis.releaseMetadata.validationStatus));
  } else if (releaseAnalysis.releaseMetadata.validationStatus === "warning") {
    score += 20;
    ev.push(evidence("release_pipeline", "Pipeline validation has warnings.", releaseAnalysis.releaseMetadata.validationStatus));
  }
  if (!releaseAnalysis.fileStructure.checksumSha256Present) {
    score += 20;
    ev.push(evidence("artifact", "SHA256 checksum is missing."));
  }
  if ((compatibility.customerImpact.estimatedAtRiskSites || 0) > 0) {
    score += Math.min(30, compatibility.customerImpact.estimatedAtRiskSites * 5);
    ev.push(evidence("compatibility", "Some active sites may not meet WordPress or PHP requirements.", compatibility.customerImpact.estimatedAtRiskSites));
  }
  if (releaseAnalysis.version.releaseChannel === "stable" && releaseAnalysis.releaseMetadata.validationStatus !== "passed" && releaseAnalysis.releaseMetadata.validationStatus !== "not_available") {
    score += 10;
    ev.push(evidence("release_channel", "Stable release has non-passing validation status.", releaseAnalysis.releaseMetadata.validationStatus));
  }
  const affected = ["plugin_zip", "wordpress_compatibility", "php_compatibility"];
  if (sections.breakingChanges.present) affected.push("customer_upgrade_flow");
  if (sections.securityFixes.present) affected.push("security_communications");
  return {
    riskLevel: riskLevel(score),
    score: Math.min(score, 100),
    supportingEvidence: ev,
    affectedComponents: affected,
    confidenceScore: ev.length >= 4 ? 90 : ev.length >= 2 ? 75 : 60,
    mitigationSuggestions: [
      "Validate artifact checksums before publication.",
      "Review compatibility requirements against active site telemetry.",
      "Prepare rollback package and support macros before release.",
      sections.breakingChanges.present ? "Publish migration and upgrade guidance before broad rollout." : "Monitor downloads and support tickets after release.",
    ],
  };
}

module.exports = { assess, riskLevel };
