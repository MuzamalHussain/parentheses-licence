function sectionOrFallback(section, fallback) {
  return section?.present ? section.summary : fallback;
}

function generate({ releaseAnalysis, compatibility, riskAssessment }) {
  const sections = releaseAnalysis.changelog.sections;
  const version = releaseAnalysis.version.versionNumber;
  const product = releaseAnalysis.product.name;
  return {
    customerReleaseNotes: `${product} ${version} includes ${sectionOrFallback(sections.features, "product improvements")}. ${sectionOrFallback(sections.bugFixes, "Bug fixes and maintenance updates are included where applicable.")}`,
    technicalReleaseNotes: `Release ${version} metadata: channel ${releaseAnalysis.version.releaseChannel}, source ${releaseAnalysis.releaseMetadata.sourceProvider}, validation ${releaseAnalysis.releaseMetadata.validationStatus}.`,
    internalEngineeringSummary: `Risk ${riskAssessment.riskLevel} (${riskAssessment.score}). Affected components: ${riskAssessment.affectedComponents.join(", ")}.`,
    migrationGuide: sections.breakingChanges.present ? sections.breakingChanges.summary : "No explicit breaking-change migration steps were detected in the changelog.",
    upgradeGuide: `Requires WordPress ${compatibility.wordpress.requiresAtLeast || "unspecified"} and PHP ${compatibility.php.requiresAtLeast || "unspecified"}. Estimated at-risk active sites: ${compatibility.customerImpact.estimatedAtRiskSites}.`,
  };
}

module.exports = { generate };
