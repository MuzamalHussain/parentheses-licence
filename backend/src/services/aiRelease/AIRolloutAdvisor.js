function recommend({ releaseAnalysis, riskAssessment }) {
  const channel = releaseAnalysis.version.releaseChannel;
  let strategy = "immediate_release";
  if (["alpha", "beta"].includes(channel)) strategy = "beta_release";
  else if (channel === "release_candidate") strategy = "limited_rollout";
  else if (["high", "critical"].includes(riskAssessment.riskLevel)) strategy = "limited_rollout";
  else if (riskAssessment.riskLevel === "medium") strategy = "canary_foundation";
  return {
    strategy,
    rollbackPreparation: ["high", "critical", "medium"].includes(riskAssessment.riskLevel),
    recommendation: {
      immediateRelease: strategy === "immediate_release",
      limitedRollout: strategy === "limited_rollout",
      betaRelease: strategy === "beta_release",
      canaryFoundation: strategy === "canary_foundation",
    },
    rationale: `Strategy ${strategy} selected from release channel ${channel} and risk ${riskAssessment.riskLevel}.`,
    guardrails: [
      "Do not publish automatically.",
      "Monitor support tickets and download failures after release.",
      "Keep rollback package and previous stable version available.",
    ],
  };
}

module.exports = { recommend };
