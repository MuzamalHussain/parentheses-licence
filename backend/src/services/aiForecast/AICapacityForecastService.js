const { forecastSeries } = require("./AITrendForecastService");

function forecast(signals, forecastWindowDays = 30) {
  const downloads = forecastSeries(signals.series.downloads, forecastWindowDays);
  const tickets = forecastSeries(signals.series.tickets, forecastWindowDays);
  const aiTokens = forecastSeries(signals.series.aiTokens, forecastWindowDays);
  const observedDownloadBytes = signals.downloads.reduce((sum, row) => sum + Number(row.fileSizeBytes || 0), 0);
  const avgDownloadBytes = signals.downloads.length ? observedDownloadBytes / signals.downloads.length : 0;
  const predictedDownloads = downloads.points.reduce((sum, point) => sum + point.value, 0);
  const predictedTickets = tickets.points.reduce((sum, point) => sum + point.value, 0);
  const predictedTokens = aiTokens.points.reduce((sum, point) => sum + point.value, 0);
  return {
    databaseGrowth: {
      records: Math.round(predictedDownloads + predictedTickets + predictedTokens / 1000),
      assumption: "Estimated from forecasted downloads, support tickets, and AI usage logs.",
    },
    storageUsage: {
      bytes: Math.round(predictedDownloads * avgDownloadBytes),
      averageObservedDownloadBytes: Math.round(avgDownloadBytes),
    },
    bandwidth: {
      bytes: Math.round(predictedDownloads * avgDownloadBytes),
      downloadRequests: Math.round(predictedDownloads),
    },
    queueGrowth: {
      jobs: Math.round(predictedTickets * 0.4 + predictedDownloads * 0.05),
      assumption: "Support and download events are used as proxy workload signals.",
    },
    aiTokenUsage: {
      tokens: Math.round(predictedTokens),
      confidenceScore: aiTokens.confidenceScore,
    },
    apiTraffic: {
      requests: Math.round(predictedDownloads * 1.8 + predictedTickets * 2),
      assumption: "API traffic proxy uses download and support activity until request telemetry is available.",
    },
    confidenceScore: Math.round((downloads.confidenceScore + tickets.confidenceScore + aiTokens.confidenceScore) / 3),
  };
}

module.exports = { forecast };
