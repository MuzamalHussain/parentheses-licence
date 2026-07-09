function normalizeResponse(input = {}) {
  return {
    providerId: input.providerId,
    modelId: input.modelId,
    status: input.status || "success",
    responseTimeMs: Number(input.responseTimeMs || 0),
    usage: input.usage || {},
    metadata: input.metadata || {},
  };
}

module.exports = { normalizeResponse };
