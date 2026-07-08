const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const OrganizationService = require("../organizationService");
const OrganizationIdentityProvider = require("../../models/OrganizationIdentityProvider");
const OrganizationSecurityPolicy = require("../../models/OrganizationSecurityPolicy");
const UserMfaMethod = require("../../models/UserMfaMethod");
const IdentityAuditEvent = require("../../models/IdentityAuditEvent");
const User = require("../../models/User");
const OrganizationMembership = require("../../models/OrganizationMembership");
const { AppError } = require("../../utils/errorHandler");
const { writeAuditLog } = require("../../utils/auditLog");
const { activeSerializedSessions, getCurrentRefreshSessionId, getSessionClient } = require("../../utils/sessionSecurity");

const PROVIDERS = [
  { key: "google_workspace", label: "Google Workspace", protocol: "oidc", status: "prepared" },
  { key: "microsoft_entra", label: "Microsoft Entra ID", protocol: "oidc", status: "prepared" },
  { key: "okta", label: "Okta", protocol: "oidc", status: "prepared" },
  { key: "onelogin", label: "OneLogin", protocol: "saml2", status: "prepared" },
  { key: "auth0", label: "Auth0", protocol: "oidc", status: "prepared" },
  { key: "oidc", label: "Generic OpenID Connect", protocol: "oidc", status: "prepared" },
  { key: "saml", label: "Generic SAML 2.0", protocol: "saml2", status: "prepared" },
];

const DEFAULT_POLICY = {
  authentication: {
    localLoginAllowed: true,
    socialLoginAllowed: false,
    ssoRequired: false,
    allowedMethods: ["local"],
  },
  mfa: {
    required: false,
    allowedMethods: ["totp", "recovery_code"],
    gracePeriodDays: 0,
  },
  sessions: {
    lifetimeMinutes: 10080,
    idleTimeoutMinutes: 480,
    maxActiveSessions: 10,
    revokeOnPasswordChange: true,
  },
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: false,
    historyCount: 0,
    expirationDays: 0,
    lockoutAttempts: 5,
  },
  network: {
    ipAllowlistEnabled: false,
    ipAllowlist: [],
  },
  scim: {
    enabled: false,
    baseUrl: "",
    tokenConfigured: false,
    groupSyncEnabled: false,
  },
};

const POLICY_SECTIONS = Object.keys(DEFAULT_POLICY);
const PROVIDER_PROTOCOLS = {
  google_workspace: "oidc",
  microsoft_entra: "oidc",
  okta: "oidc",
  onelogin: "saml2",
  auth0: "oidc",
  oidc: "oidc",
  saml: "saml2",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergePolicy(policy) {
  const merged = clone(DEFAULT_POLICY);
  if (!policy) return merged;
  POLICY_SECTIONS.forEach((section) => {
    merged[section] = { ...merged[section], ...(policy[section]?.toObject?.() || policy[section] || {}) };
  });
  return merged;
}

function normalizeList(values = []) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function audit(action, { actor = null, organizationId = null, userId = null, metadata = {}, ip = "", userAgent = "", requestId = "" } = {}) {
  const payload = {
    organizationId,
    userId: userId || actor?._id,
    action,
    metadata,
    ipAddress: ip,
    userAgent,
  };
  return Promise.all([
    IdentityAuditEvent.create(payload).catch(() => null),
    writeAuditLog({
      actor,
      action,
      targetType: "EnterpriseIdentity",
      targetId: organizationId || userId || actor?._id || null,
      metadata: { organizationId, userId, ...metadata },
      ip,
      requestId,
    }).catch(() => null),
  ]);
}

async function assertManageIdentity(actor, organizationId) {
  if (!actor) throw new AppError("Authentication required.", 401);
  if (actor.role === "admin") return true;
  const ctx = await OrganizationService.assertMembership(actor._id, organizationId);
  if (!["owner", "admin"].includes(ctx.membership.role)) {
    throw new AppError("You do not have permission to manage enterprise identity.", 403);
  }
  return true;
}

async function ensurePolicy(organizationId) {
  let policy = await OrganizationSecurityPolicy.findOne({ organizationId });
  if (!policy) policy = await OrganizationSecurityPolicy.create({ organizationId });
  return policy;
}

async function resolvePolicy(organizationId = null) {
  if (!organizationId) return mergePolicy(null);
  const policy = await OrganizationSecurityPolicy.findOne({ organizationId }).lean();
  return mergePolicy(policy);
}

function validatePolicyPatch(input = {}) {
  const patch = {};
  POLICY_SECTIONS.forEach((section) => {
    if (input[section] !== undefined && typeof input[section] === "object" && input[section] !== null) {
      patch[section] = { ...input[section] };
    }
  });

  if (patch.authentication) {
    const allowed = ["local", "oauth2", "oidc", "saml2"];
    patch.authentication.allowedMethods = normalizeList(patch.authentication.allowedMethods || DEFAULT_POLICY.authentication.allowedMethods)
      .filter((method) => allowed.includes(method));
    if (patch.authentication.allowedMethods.length === 0) patch.authentication.allowedMethods = ["local"];
    if (patch.authentication.ssoRequired && patch.authentication.localLoginAllowed === false && patch.authentication.allowedMethods.length === 1 && patch.authentication.allowedMethods[0] === "local") {
      throw new AppError("SSO policies must allow an SSO authentication method.", 422);
    }
  }

  if (patch.password) {
    const minLength = Number(patch.password.minLength ?? DEFAULT_POLICY.password.minLength);
    if (minLength < 8 || minLength > 128) throw new AppError("Password minimum length must be between 8 and 128.", 422);
    patch.password.minLength = minLength;
  }

  if (patch.sessions) {
    const idle = Number(patch.sessions.idleTimeoutMinutes ?? DEFAULT_POLICY.sessions.idleTimeoutMinutes);
    const lifetime = Number(patch.sessions.lifetimeMinutes ?? DEFAULT_POLICY.sessions.lifetimeMinutes);
    if (idle > lifetime) throw new AppError("Idle timeout cannot exceed session lifetime.", 422);
  }

  if (patch.network?.ipAllowlist) patch.network.ipAllowlist = normalizeList(patch.network.ipAllowlist);
  return patch;
}

async function updatePolicy(organizationId, input = {}, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  const policy = await ensurePolicy(organizationId);
  const patch = validatePolicyPatch(input);
  Object.entries(patch).forEach(([section, value]) => {
    policy[section] = { ...(policy[section]?.toObject?.() || policy[section] || {}), ...value };
  });
  policy.updatedBy = context.actor?._id;
  await policy.save();
  await audit("identity.policy_changed", { ...context, organizationId, metadata: { sections: Object.keys(patch) } });
  return mergePolicy(policy);
}

function providerPayload(provider) {
  return {
    _id: provider._id,
    organizationId: provider.organizationId,
    name: provider.name,
    provider: provider.provider,
    protocol: provider.protocol,
    status: provider.status,
    domains: provider.domains || [],
    configuration: provider.configuration || {},
    secretsConfigured: provider.secretsConfigured || {},
    lastTestedAt: provider.lastTestedAt,
    lastError: provider.lastError || "",
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function validateProvider(input = {}) {
  const provider = String(input.provider || "").trim();
  if (!PROVIDER_PROTOCOLS[provider]) throw new AppError("Unsupported identity provider.", 422);
  const protocol = input.protocol || PROVIDER_PROTOCOLS[provider];
  if (!["oauth2", "oidc", "saml2"].includes(protocol)) throw new AppError("Unsupported authentication protocol.", 422);
  return {
    name: String(input.name || provider).trim(),
    provider,
    protocol,
    status: ["draft", "enabled", "disabled", "error"].includes(input.status) ? input.status : "draft",
    domains: normalizeList(input.domains || []),
    configuration: {
      ...(input.configuration || {}),
      scopes: normalizeList(input.configuration?.scopes || []),
    },
    secretsConfigured: {
      clientSecret: Boolean(input.secretsConfigured?.clientSecret),
      signingCertificate: Boolean(input.secretsConfigured?.signingCertificate),
    },
  };
}

async function saveProvider(organizationId, input = {}, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  const data = validateProvider(input);
  const provider = input.providerId
    ? await OrganizationIdentityProvider.findOne({ _id: input.providerId, organizationId })
    : new OrganizationIdentityProvider({ organizationId });
  if (!provider) throw new AppError("Identity provider not found.", 404);
  Object.assign(provider, data, { updatedBy: context.actor?._id });
  await provider.save();
  await audit("identity.provider_updated", { ...context, organizationId, metadata: { provider: provider.provider, status: provider.status } });
  return providerPayload(provider);
}

async function setProviderStatus(organizationId, providerId, status, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  if (!["enabled", "disabled", "draft"].includes(status)) throw new AppError("Invalid provider status.", 422);
  const provider = await OrganizationIdentityProvider.findOne({ _id: providerId, organizationId });
  if (!provider) throw new AppError("Identity provider not found.", 404);
  provider.status = status;
  provider.updatedBy = context.actor?._id;
  await provider.save();
  await audit("identity.provider_updated", { ...context, organizationId, metadata: { provider: provider.provider, status } });
  return providerPayload(provider);
}

async function testProvider(organizationId, providerId, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  const provider = await OrganizationIdentityProvider.findOne({ _id: providerId, organizationId });
  if (!provider) throw new AppError("Identity provider not found.", 404);
  const missing = [];
  if (["oauth2", "oidc"].includes(provider.protocol) && !provider.configuration?.clientId) missing.push("clientId");
  if (provider.protocol === "saml2" && !provider.configuration?.ssoUrl) missing.push("ssoUrl");
  provider.lastTestedAt = new Date();
  provider.lastError = missing.length ? `Missing ${missing.join(", ")}` : "";
  provider.status = missing.length ? "error" : provider.status;
  await provider.save();
  await audit("identity.provider_tested", { ...context, organizationId, metadata: { provider: provider.provider, healthy: missing.length === 0 } });
  return { healthy: missing.length === 0, missing, provider: providerPayload(provider) };
}

function validatePassword(password, policy = DEFAULT_POLICY.password, previousHashes = []) {
  const errors = [];
  const value = String(password || "");
  if (value.length < policy.minLength) errors.push(`Password must be at least ${policy.minLength} characters.`);
  if (policy.requireUppercase && !/[A-Z]/.test(value)) errors.push("Password must include an uppercase letter.");
  if (policy.requireLowercase && !/[a-z]/.test(value)) errors.push("Password must include a lowercase letter.");
  if (policy.requireNumber && !/[0-9]/.test(value)) errors.push("Password must include a number.");
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(value)) errors.push("Password must include a symbol.");
  if (previousHashes.some((hash) => bcrypt.compareSync(value, hash))) errors.push("Password was recently used.");
  return { valid: errors.length === 0, errors };
}

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  buffer.forEach((byte) => { bits += byte.toString(2).padStart(8, "0"); });
  return bits.match(/.{1,5}/g).map((chunk) => alphabet[parseInt(chunk.padEnd(5, "0"), 2)]).join("");
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = String(value || "").replace(/=+$/g, "").toUpperCase().split("")
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const bytes = bits.match(/.{1,8}/g) || [];
  return Buffer.from(bytes.filter((byte) => byte.length === 8).map((byte) => parseInt(byte, 2)));
}

function totp(secret, timestamp = Date.now(), step = 30) {
  const counter = Math.floor(timestamp / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

function verifyTotp(secret, code, window = 1) {
  const submitted = String(code || "").replace(/\s+/g, "");
  for (let drift = -window; drift <= window; drift += 1) {
    if (totp(secret, Date.now() + drift * 30_000) === submitted) return true;
  }
  return false;
}

async function startMfaSetup(userId, organizationId = null, context = {}) {
  if (context.actor?._id?.toString() !== userId.toString() && context.actor?.role !== "admin") {
    throw new AppError("You cannot manage MFA for another user.", 403);
  }
  const secret = base32Encode(crypto.randomBytes(20));
  const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
  const recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
  const methodQuery = UserMfaMethod.findOneAndUpdate(
    { userId, organizationId, method: "totp" },
    {
      userId,
      organizationId,
      method: "totp",
      status: "pending",
      label: "Authenticator app",
      secretEncrypted: secret,
      recoveryCodeHashes,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const method = methodQuery?.select
    ? await methodQuery.select("+secretEncrypted +recoveryCodeHashes")
    : await methodQuery;
  await audit("identity.mfa_setup_started", { ...context, organizationId, userId });
  return {
    methodId: method._id,
    secret,
    otpauthUrl: `otpauth://totp/Parentheses:${userId}?secret=${secret}&issuer=Parentheses`,
    recoveryCodes,
  };
}

async function verifyMfaSetup(userId, code, organizationId = null, context = {}) {
  if (context.actor?._id?.toString() !== userId.toString() && context.actor?.role !== "admin") {
    throw new AppError("You cannot manage MFA for another user.", 403);
  }
  const method = await UserMfaMethod.findOne({ userId, organizationId, method: "totp" }).select("+secretEncrypted");
  if (!method || !method.secretEncrypted) throw new AppError("MFA setup was not started.", 404);
  if (!verifyTotp(method.secretEncrypted, code)) throw new AppError("MFA code is invalid.", 401);
  method.status = "enabled";
  method.enabledAt = new Date();
  await method.save();
  await User.findByIdAndUpdate(userId, { twoFactorEnabled: true });
  await audit("identity.mfa_enabled", { ...context, organizationId, userId });
  return { enabled: true, method: "totp" };
}

async function disableMfa(userId, organizationId = null, context = {}) {
  if (context.actor?._id?.toString() !== userId.toString() && context.actor?.role !== "admin") {
    throw new AppError("You cannot manage MFA for another user.", 403);
  }
  await UserMfaMethod.updateMany({ userId, organizationId, status: { $ne: "disabled" } }, { status: "disabled", disabledAt: new Date() });
  await User.findByIdAndUpdate(userId, { twoFactorEnabled: false });
  await audit("identity.mfa_disabled", { ...context, organizationId, userId });
  return { enabled: false };
}

async function verifyMfa(userId, code, organizationId = null) {
  const method = await UserMfaMethod.findOne({ userId, organizationId, method: "totp", status: "enabled" }).select("+secretEncrypted +recoveryCodeHashes");
  if (!method) return false;
  if (verifyTotp(method.secretEncrypted, code)) {
    method.lastUsedAt = new Date();
    await method.save({ validateBeforeSave: false });
    return true;
  }
  for (let index = 0; index < (method.recoveryCodeHashes || []).length; index += 1) {
    if (await bcrypt.compare(String(code || ""), method.recoveryCodeHashes[index])) {
      method.recoveryCodeHashes.splice(index, 1);
      method.lastUsedAt = new Date();
      await method.save({ validateBeforeSave: false });
      return true;
    }
  }
  return false;
}

async function sessionsForOrganization(organizationId, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  const memberships = await OrganizationMembership.find({ organizationId, status: "active" }).lean();
  const userIds = memberships.map((membership) => membership.userId?._id || membership.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select("+refreshSessions name email role").lean();
  return users.flatMap((user) => activeSerializedSessions(user).map((session) => ({
    ...session,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  })));
}

async function revokeSession(userId, sessionId, organizationId, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  await OrganizationService.assertMembership(userId, organizationId);
  const user = await User.findById(userId).select("+refreshSessions");
  if (!user) throw new AppError("User not found.", 404);
  const before = user.refreshSessions?.length || 0;
  user.refreshSessions = (user.refreshSessions || []).filter((session) => session.sessionId !== sessionId);
  await user.save({ validateBeforeSave: false });
  await audit("identity.session_revoked", { ...context, organizationId, userId, metadata: { sessionId, revoked: before - (user.refreshSessions?.length || 0) } });
  return { revoked: before - (user.refreshSessions?.length || 0) };
}

async function overview(organizationId, context = {}) {
  await assertManageIdentity(context.actor, organizationId);
  const [policy, providers, mfaMethods, identityEvents] = await Promise.all([
    ensurePolicy(organizationId),
    OrganizationIdentityProvider.find({ organizationId }).sort({ createdAt: -1 }).lean(),
    UserMfaMethod.find({ organizationId, status: "enabled" }).lean(),
    IdentityAuditEvent.find({ organizationId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  const sessions = await sessionsForOrganization(organizationId, context);
  return {
    supportedProviders: PROVIDERS,
    policy: mergePolicy(policy),
    providers: providers.map(providerPayload),
    mfa: {
      enabledUsers: new Set(mfaMethods.map((method) => String(method.userId))).size,
      methods: mfaMethods.length,
    },
    sessions,
    scim: mergePolicy(policy).scim,
    recentEvents: identityEvents,
  };
}

function enforcePolicyForLogin(user, policy) {
  if (!policy.authentication.localLoginAllowed || policy.authentication.ssoRequired) {
    throw new AppError("Local login is disabled for this organization.", 403);
  }
  return true;
}

function sessionPolicyAllows(session, policy) {
  if (!session) return false;
  const now = Date.now();
  const lastUsedAt = new Date(session.lastUsedAt || session.createdAt || 0).getTime();
  const loginAt = new Date(session.loginAt || session.createdAt || 0).getTime();
  return now - lastUsedAt <= policy.sessions.idleTimeoutMinutes * 60_000
    && now - loginAt <= policy.sessions.lifetimeMinutes * 60_000;
}

module.exports = {
  DEFAULT_POLICY,
  PROVIDERS,
  audit,
  base32Encode,
  enforcePolicyForLogin,
  overview,
  resolvePolicy,
  saveProvider,
  sessionPolicyAllows,
  setProviderStatus,
  startMfaSetup,
  testProvider,
  totp,
  updatePolicy,
  validatePassword,
  verifyMfa,
  verifyMfaSetup,
  disableMfa,
  revokeSession,
  getCurrentRefreshSessionId,
  getSessionClient,
};
