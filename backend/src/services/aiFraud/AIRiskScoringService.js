const LEVELS = [
  { level: "critical", min: 85 },
  { level: "high", min: 70 },
  { level: "medium", min: 40 },
  { level: "low", min: 0 },
];

function riskLevel(score) {
  return LEVELS.find((item) => score >= item.min)?.level || "low";
}

function confidence(evidence = []) {
  if (evidence.length >= 4) return "high";
  if (evidence.length >= 2) return "medium";
  return "low";
}

function scoreFactors(factors = []) {
  const score = Math.min(100, Math.round(factors.reduce((sum, factor) => {
    const weight = Number(factor.weight || 1);
    return sum + Number(factor.score || 0) * weight;
  }, 0)));
  return {
    score,
    riskLevel: riskLevel(score),
    confidenceLevel: confidence(factors.filter((factor) => factor.score > 0)),
    contributingFactors: factors,
  };
}

function factor(key, label, score, weight = 1) {
  return { key, label, score: Math.max(0, Math.min(100, Number(score || 0))), weight };
}

function evidence(source, metric, value, threshold, description) {
  return { source, metric, value, threshold, description };
}

module.exports = { riskLevel, confidence, scoreFactors, factor, evidence };
