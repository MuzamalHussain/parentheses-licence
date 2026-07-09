const OpenApiService = require("../publicApi/OpenApiService");

function detect(text = "") {
  const value = String(text || "").toUpperCase();
  const known = OpenApiService.errorCodes.find((error) => value.includes(error.code));
  if (known) return { type: "api_error", error: known };
  if (value.includes("401") || value.includes("UNAUTHORIZED")) return { type: "authentication", error: OpenApiService.errorCodes.find((error) => error.status === 401) };
  if (value.includes("403") || value.includes("SCOPE") || value.includes("PERMISSION")) return { type: "permission", error: OpenApiService.errorCodes.find((error) => error.code === "SCOPE_REQUIRED") };
  if (value.includes("429") || value.includes("RATE")) return { type: "rate_limit", error: OpenApiService.errorCodes.find((error) => error.code === "RATE_LIMITED") };
  if (value.includes("SIGNATURE") || value.includes("WEBHOOK")) return { type: "webhook", error: null };
  if (value.includes("VALIDATION") || value.includes("ZOD")) return { type: "validation", error: null };
  return { type: "general", error: null };
}

function explain(input = "") {
  const detected = detect(input);
  const steps = {
    authentication: ["Confirm Authorization uses Bearer format.", "Check whether the key is active, unexpired, and from the expected environment.", "Rotate the key if it may have leaked."],
    permission: ["Confirm the API key includes the endpoint scope.", "Check organization membership and RBAC role assignment.", "Avoid granting admin scope unless the integration truly requires it."],
    rate_limit: ["Read Retry-After and X-RateLimit-Reset headers.", "Use exponential backoff.", "Reduce burst concurrency per API key and endpoint."],
    webhook: ["Verify timestamp tolerance.", "Recompute the signature with the endpoint secret.", "Deduplicate by event id before processing."],
    validation: ["Compare request payload fields to the documented schema.", "Check enum values, IDs, date formats, and required fields.", "Return the platform error code to the developer log."],
    api_error: ["Apply the documented resolution for the matching error code.", "Capture requestId and endpoint metadata.", "Retry only idempotent requests or requests protected by nonce/idempotency."],
    general: ["Identify endpoint, method, requestId, and organization context.", "Check authentication, scope, payload validation, and rate-limit headers.", "Use sandbox keys to reproduce without production mutations."],
  };
  return {
    type: detected.type,
    matchedError: detected.error || null,
    explanation: detected.error
      ? `${detected.error.code} means ${detected.error.description} ${detected.error.resolution}`
      : "The issue needs endpoint, authentication, payload, and permission context to isolate safely.",
    likelyCauses: steps[detected.type] || steps.general,
    safeNextSteps: [
      "Do not paste secrets or private keys into debug prompts.",
      "Use redacted request/response samples.",
      "Check audit logs and webhook delivery logs before retrying writes.",
    ],
  };
}

module.exports = { detect, explain };
