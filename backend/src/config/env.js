const { z } = require("zod");

const booleanEnv = (defaultValue, aliasKey) =>
  z
    .preprocess((value) => {
      const raw = value === undefined || value === "" ? process.env[aliasKey] : value;
      if (raw === undefined || raw === "") return defaultValue;
      if (typeof raw === "boolean") return raw;
      return String(raw).toLowerCase() === "true";
    }, z.boolean());

const productionDefaultBooleanEnv = () =>
  z
    .preprocess((value) => {
      if (value === undefined || value === "") return process.env.NODE_ENV === "production";
      if (typeof value === "boolean") return value;
      return String(value).toLowerCase() === "true";
    }, z.boolean());

const stringWithDefault = (defaultValue) =>
  z.preprocess((value) => (value === undefined || value === "" ? defaultValue : value), z.string());

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

function splitOrigins(...values) {
  return [...new Set(
    values
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((origin) => origin.trim())
      .filter(Boolean)
  )];
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production", "test"]).optional(),
  DEPLOYMENT_TARGET: stringWithDefault("local"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: stringWithDefault("http://localhost:5173"),
  CORS_ORIGIN: optionalString,

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  MONGO_DB_NAME: stringWithDefault("parentheses_licensing"),
  DNS_SERVERS: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRES: stringWithDefault("15m"),
  JWT_REFRESH_EXPIRES: stringWithDefault("7d"),
  JWT_ISSUER: stringWithDefault("parentheses-licensing"),
  JWT_AUDIENCE: stringWithDefault("parentheses-licensing-users"),
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_MAX_REFRESH_SESSIONS: z.coerce.number().int().positive().default(5),

  REDIS_ENABLED: booleanEnv(false),
  REDIS_URL: stringWithDefault("redis://localhost:6379"),

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  SMTP_REPLY_TO: optionalString,
  EMAIL_PROVIDER: stringWithDefault("smtp"),
  EMAIL_RETRY_COUNT: z.coerce.number().int().min(0).default(2),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  STARTUP_VERIFY_SMTP: booleanEnv(false),

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  LOCAL_PSP_BASE_URL: stringWithDefault("https://sandbox.local-psp.example.com/api/v1"),
  LOCAL_PSP_MERCHANT_ID: stringWithDefault("dummy_merchant_id"),
  LOCAL_PSP_SECRET_KEY: stringWithDefault("dummy_secret_key_replace_me"),

  STORAGE_PROVIDER: stringWithDefault("local"),
  UPLOAD_ROOT: stringWithDefault("uploads"),
  BACKUP_ROOT: stringWithDefault("backups"),
  CONFIG_BACKUP_INCLUDE_ENV: booleanEnv(false),
  BACKUP_READINESS_STRICT: productionDefaultBooleanEnv(),

  ENABLE_STRIPE: booleanEnv(true, "STRIPE_ENABLED"),
  ENABLE_LOCAL_PSP: booleanEnv(true, "LOCAL_PSP_ENABLED"),
  ENABLE_EMAIL_VERIFICATION_ENFORCEMENT: booleanEnv(true),
  ENABLE_WORDPRESS_UPDATER: booleanEnv(true),
  ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT: productionDefaultBooleanEnv(),
  ENABLE_ADVANCED_SESSION_SECURITY: booleanEnv(false),
  ENABLE_WEBHOOK_STRICT_IDEMPOTENCY: booleanEnv(false),
  ENABLE_PAYMENT_TRANSACTIONS: booleanEnv(false),
  ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD: booleanEnv(false),
  MAINTENANCE_MODE: booleanEnv(false),
  READ_ONLY_MODE: booleanEnv(false),
  EMERGENCY_SHUTDOWN: booleanEnv(false),

  PLUGIN_ZIP_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),
  PLUGIN_ZIP_MAX_UNCOMPRESSED_MB: z.coerce.number().int().positive().default(150),
  PLUGIN_ZIP_MAX_FILES: z.coerce.number().int().positive().default(2000),
  PLUGIN_ZIP_MAX_COMPRESSION_RATIO: z.coerce.number().positive().default(20),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production") {
    if (env.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET must be at least 32 characters in production",
      });
    }
    if (env.JWT_REFRESH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET must be at least 32 characters in production",
      });
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_REFRESH_SECRET"],
      message: "JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET",
    });
  }
  if (env.NODE_ENV === "production" && splitOrigins(env.CLIENT_URL, env.CORS_ORIGIN).includes("*")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CORS_ORIGIN"],
      message: "Wildcard CORS origins are not allowed in production",
    });
  }
  if (env.NODE_ENV === "production" && env.APP_ENV && env.APP_ENV !== "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_ENV"],
      message: "APP_ENV must be production when NODE_ENV is production",
    });
  }
});

let config;

function buildConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const env = parsed.data;
  const clientOrigins = splitOrigins(env.CLIENT_URL, env.CORS_ORIGIN);

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      appEnv: env.APP_ENV || env.NODE_ENV,
      deploymentTarget: env.DEPLOYMENT_TARGET,
      port: env.PORT,
      clientUrl: env.CLIENT_URL,
      clientOrigins,
      isProduction: env.NODE_ENV === "production",
      isDevelopment: env.NODE_ENV === "development",
    },
    database: {
      uri: env.MONGO_URI,
      name: env.MONGO_DB_NAME,
      dnsServers: env.DNS_SERVERS ? env.DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean) : [],
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpires: env.JWT_ACCESS_EXPIRES,
      refreshExpires: env.JWT_REFRESH_EXPIRES,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      maxFailedLoginAttempts: env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
      loginLockoutMinutes: env.AUTH_LOGIN_LOCKOUT_MINUTES,
      maxRefreshSessions: env.AUTH_MAX_REFRESH_SESSIONS,
    },
    cors: {
      allowedOrigins: clientOrigins,
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
      replyTo: env.SMTP_REPLY_TO,
      retryCount: env.EMAIL_RETRY_COUNT,
      timeoutMs: env.EMAIL_TIMEOUT_MS,
      verifyOnStartup: env.STARTUP_VERIFY_SMTP,
      enabled: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM),
    },
    storage: {
      provider: env.STORAGE_PROVIDER,
      uploadRoot: env.UPLOAD_ROOT,
      pluginUploadDir: `${env.UPLOAD_ROOT.replace(/[\\/]+$/, "")}/plugins`,
    },
    payments: {
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      localPspBaseUrl: env.LOCAL_PSP_BASE_URL,
      localPspMerchantId: env.LOCAL_PSP_MERCHANT_ID,
      localPspSecretKey: env.LOCAL_PSP_SECRET_KEY,
    },
    downloads: {
      provider: env.STORAGE_PROVIDER,
      pluginZip: {
        maxUploadBytes: env.PLUGIN_ZIP_MAX_UPLOAD_MB * 1024 * 1024,
        maxUncompressedBytes: env.PLUGIN_ZIP_MAX_UNCOMPRESSED_MB * 1024 * 1024,
        maxFiles: env.PLUGIN_ZIP_MAX_FILES,
        maxCompressionRatio: env.PLUGIN_ZIP_MAX_COMPRESSION_RATIO,
      },
    },
    operations: {
      backupRoot: env.BACKUP_ROOT,
      configBackupIncludeEnv: env.CONFIG_BACKUP_INCLUDE_ENV,
      backupReadinessStrict: env.BACKUP_READINESS_STRICT,
      maintenanceMode: env.MAINTENANCE_MODE,
      readOnlyMode: env.READ_ONLY_MODE,
      emergencyShutdown: env.EMERGENCY_SHUTDOWN,
    },
    security: {
      redisEnabled: env.REDIS_ENABLED,
      redisUrl: env.REDIS_URL,
    },
    features: {
      ENABLE_STRIPE: env.ENABLE_STRIPE,
      ENABLE_LOCAL_PSP: env.ENABLE_LOCAL_PSP,
      ENABLE_EMAIL_VERIFICATION_ENFORCEMENT: env.ENABLE_EMAIL_VERIFICATION_ENFORCEMENT,
      ENABLE_WORDPRESS_UPDATER: env.ENABLE_WORDPRESS_UPDATER,
      ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT: env.ENABLE_PLUGIN_UPLOAD_SECURITY_STRICT,
      ENABLE_ADVANCED_SESSION_SECURITY: env.ENABLE_ADVANCED_SESSION_SECURITY,
      ENABLE_WEBHOOK_STRICT_IDEMPOTENCY: env.ENABLE_WEBHOOK_STRICT_IDEMPOTENCY,
      ENABLE_PAYMENT_TRANSACTIONS: env.ENABLE_PAYMENT_TRANSACTIONS,
      ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD: env.ENABLE_LICENSE_ACTIVATION_ATOMIC_GUARD,
    },
  };
}

function getConfig() {
  if (!config) config = buildConfig();
  return config;
}

module.exports = { getConfig };
