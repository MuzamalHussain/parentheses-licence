function estimateCost({ promptTokens = 0, completionTokens = 0, pricing = {} } = {}) {
  const promptCost = (Number(promptTokens) / 1_000_000) * Number(pricing.promptPerMillion || 0);
  const completionCost = (Number(completionTokens) / 1_000_000) * Number(pricing.completionPerMillion || 0);
  return Number((promptCost + completionCost).toFixed(8));
}

function budgetStatus({ used = 0, dailyLimit = 0, monthlyLimit = 0 } = {}) {
  return {
    used,
    dailyLimit,
    monthlyLimit,
    dailyExceeded: Boolean(dailyLimit && used > dailyLimit),
    monthlyExceeded: Boolean(monthlyLimit && used > monthlyLimit),
  };
}

module.exports = { budgetStatus, estimateCost };
