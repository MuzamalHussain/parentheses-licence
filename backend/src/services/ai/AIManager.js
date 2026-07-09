const crypto = require("crypto");
const registry = require("./AIProviderRegistry");
const ModelRegistry = require("./AIModelRegistry");
const PromptRegistry = require("./PromptRegistry");
const TokenTracker = require("./AITokenTracker");
const Audit = require("./AIAuditService");
const Permissions = require("./AIPermissionService");
const AIProviderConfig = require("../../models/AIProviderConfig");
const { AppError } = require("../../utils/errorHandler");

const SECRET = crypto.createHash("sha256").update(process.env.AI_SETTINGS_SECRET || process.env.JWT_ACCESS_SECRET || "parentheses-ai-dev-secret").digest();

function encrypt(value = "") {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function fingerprint(value = "") {
  return value ? crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16) : "";
}

function publicProvider(provider) {
  return {
    _id: provider._id,
    organizationId: provider.organizationId,
    providerId: provider.providerId,
    name: provider.name,
    status: provider.status,
    baseUrl: provider.baseUrl,
    apiKeyConfigured: Boolean(provider.apiKeyFingerprint || provider.encryptedApiKey),
    apiKeyFingerprint: provider.apiKeyFingerprint,
    timeoutMs: provider.timeoutMs,
    retries: provider.retries,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    streamingEnabled: provider.streamingEnabled,
    fallbackOrder: provider.fallbackOrder,
    capabilities: provider.capabilities || [],
    health: provider.health || {},
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

async function saveProvider(organizationId, input = {}, context = {}) {
  await Permissions.assert(context.actor, organizationId, "ai.provider.manage");
  const definition = registry.get(input.providerId);
  const validation = definition.validateConfig(input);
  if (!validation.valid) throw new AppError(validation.errors[0], 422);
  const set = {
    name: input.name || definition.name,
    status: input.status || "pending",
    baseUrl: input.baseUrl || definition.defaultBaseUrl || "",
    timeoutMs: Number(input.timeoutMs || 30000),
    retries: Number(input.retries ?? 2),
    temperature: Number(input.temperature ?? 0.2),
    maxTokens: Number(input.maxTokens || 4096),
    streamingEnabled: Boolean(input.streamingEnabled),
    fallbackOrder: Number(input.fallbackOrder ?? 100),
    capabilities: input.capabilities?.length ? input.capabilities : definition.capabilities,
    updatedBy: context.actor?._id,
  };
  if (input.apiKey) {
    set.encryptedApiKey = encrypt(input.apiKey);
    set.apiKeyFingerprint = fingerprint(input.apiKey);
  }
  const provider = await AIProviderConfig.findOneAndUpdate(
    { organizationId, providerId: input.providerId },
    { $set: set, $setOnInsert: { organizationId, providerId: input.providerId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Audit.record(input.apiKey ? "ai.api_key_changed" : "ai.provider_updated", { ...context, organizationId, targetId: provider._id, metadata: { providerId: provider.providerId } });
  return publicProvider(provider);
}

async function listProviders(organizationId) {
  const configured = await AIProviderConfig.find({ organizationId }).sort({ fallbackOrder: 1, providerId: 1 }).lean();
  return configured.map(publicProvider);
}

async function healthCheck(organizationId, providerId, context = {}) {
  await Permissions.assert(context.actor, organizationId, "ai.provider.manage");
  const provider = await AIProviderConfig.findOne({ organizationId, providerId });
  if (!provider) throw new AppError("AI provider is not configured.", 404);
  const result = await registry.get(providerId).health(provider);
  provider.health = { status: result.status, lastCheckedAt: new Date(), lastError: result.errors?.[0] || "" };
  await provider.save();
  if (result.status !== "healthy") await Audit.record("ai.failure", { ...context, organizationId, targetId: provider._id, metadata: { providerId, errors: result.errors } });
  return publicProvider(provider);
}

async function overview(organizationId, context = {}) {
  await Permissions.assert(context.actor, organizationId, "ai.analytics.read");
  const [providers, models, prompts, usage] = await Promise.all([
    listProviders(organizationId),
    ModelRegistry.listModels(organizationId),
    PromptRegistry.listPrompts(organizationId),
    TokenTracker.summary(organizationId).catch(() => []),
  ]);
  return {
    supportedProviders: registry.list(),
    providers,
    models,
    prompts,
    usage,
    settings: {
      defaults: { timeoutMs: 30000, retries: 2, temperature: 0.2, maxTokens: 4096, streamingEnabled: false },
      fallbackEnabled: true,
    },
  };
}

module.exports = {
  encrypt,
  fingerprint,
  healthCheck,
  listProviders,
  overview,
  publicProvider,
  saveProvider,
};
