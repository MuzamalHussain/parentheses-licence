const { z } = require("zod");

// ── Auth ──────────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  companyName: z.string().max(150).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  companyName: z.string().trim().max(150).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one profile field is required.",
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string().min(1, "Password confirmation is required."),
}).strict().refine((data) => data.newPassword === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

const adminUserProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  companyName: z.string().trim().max(150).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one profile field is required.",
});

const adminUserStatusSchema = z.object({
  action: z.enum(["activate", "deactivate", "suspend", "unsuspend"]),
}).strict();

const adminUserEmailVerificationSchema = z.object({
  emailVerified: z.boolean(),
}).strict();

const adminUserInternalNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
}).strict();

// ── Products ─────────────────────────────────────────────────────────────────
const productStatusSchema = z.enum(["draft", "private", "published", "active", "archived", "deprecated", "hidden"]);
const releaseChannelSchema = z.enum(["stable", "beta", "alpha"]);
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase words separated by dashes");
const pluginFolderSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]*$/, "Can only contain letters, numbers, dots, underscores, and dashes");
const mainPluginFileSchema = z.string().trim().regex(/^[A-Za-z0-9._-]+\.php$/, "Must be a PHP file name");
const productArraySchema = z.array(z.string().trim().max(120)).max(50);
const createProductSchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: slugSchema.max(150).optional(),
  internalProductCode: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/, "Can only contain letters, numbers, dots, underscores, and dashes").optional(),
  description: z.string().trim().max(5000).optional(),
  shortDescription: z.string().trim().max(500).optional(),
  status: productStatusSchema.optional(),
  price: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  licenseType: z.enum(["single_site", "multi_site", "unlimited", "subscription", "lifetime"]).optional(),
  lifetimeSupport: z.coerce.boolean().optional(),
  lifetimeUpdates: z.coerce.boolean().optional(),
  renewalSupported: z.coerce.boolean().optional(),
  upgradeSupported: z.coerce.boolean().optional(),
  pluginSlug: slugSchema.max(150).optional(),
  pluginFolder: pluginFolderSchema.max(150).optional(),
  mainPluginFile: mainPluginFileSchema.max(150).optional(),
  textDomain: z.string().trim().toLowerCase().max(150).optional(),
  minPhpVersion: z.string().trim().max(40).optional(),
  minWpVersion: z.string().trim().max(40).optional(),
  testedUpTo: z.string().trim().max(40).optional(),
  productLogo: z.string().trim().max(1000).optional(),
  productBanner: z.string().trim().max(1000).optional(),
  featuredImage: z.string().trim().max(1000).optional(),
  supportedPlatforms: productArraySchema.optional(),
  supportedPhpVersions: productArraySchema.optional(),
  supportedWpVersions: productArraySchema.optional(),
  dependencies: productArraySchema.optional(),
  defaultReleaseChannel: releaseChannelSchema.optional(),
  stableBranch: z.string().trim().max(120).optional(),
  betaEnabled: z.coerce.boolean().optional(),
  alphaEnabled: z.coerce.boolean().optional(),
  downloadEnabled: z.coerce.boolean().optional(),
  publicDownloadDisabled: z.coerce.boolean().optional(),
  licenseRequired: z.coerce.boolean().optional(),
  productUrl: z.string().trim().url().max(1000).or(z.literal("")).optional(),
  metaTitle: z.string().trim().max(150).optional(),
  metaDescription: z.string().trim().max(320).optional(),
}).strict();

const updateProductSchema = createProductSchema.partial();

const versionStatusSchema = z.enum(["draft", "published", "hidden", "archived", "deprecated"]);
const versionReleaseChannelSchema = z.enum(["stable", "release_candidate", "beta", "alpha", "internal", "deprecated"]);
const updateVersionSchema = z.object({
  versionName: z.string().trim().max(150).optional(),
  status: versionStatusSchema.optional(),
  releaseChannel: versionReleaseChannelSchema.optional(),
  description: z.string().trim().max(5000).optional(),
  changelog: z.string().trim().max(10000).optional(),
  releaseNotes: z.string().trim().max(20000).optional(),
  minWpVersion: z.string().trim().max(40).optional(),
  minPhpVersion: z.string().trim().max(40).optional(),
  testedUpTo: z.string().trim().max(40).optional(),
  pluginSlug: slugSchema.max(150).optional(),
  releaseDate: z.coerce.date().optional(),
  newFeatures: z.string().trim().max(5000).optional(),
  improvements: z.string().trim().max(5000).optional(),
  bugFixes: z.string().trim().max(5000).optional(),
  securityFixes: z.string().trim().max(5000).optional(),
  breakingChanges: z.string().trim().max(5000).optional(),
  developerNotes: z.string().trim().max(5000).optional(),
}).strict();

const versionQuerySchema = z.object({
  status: versionStatusSchema.optional(),
  releaseChannel: versionReleaseChannelSchema.optional(),
  latest: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(150).optional(),
}).passthrough();

// ── Plans ─────────────────────────────────────────────────────────────────────
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  allowedSites: z.number().int().min(0),
  planType: z.enum(["single_site", "3_sites", "5_sites", "10_sites", "agency", "unlimited", "lifetime", "trial", "custom"]).optional(),
  upgradeRank: z.number().int().min(0).optional(),
  priceUSD: z.number().min(0),
  priceLocal: z.number().min(0),
  durationDays: z.number().int().min(0).optional(),
  renewalType: z.enum(["recurring", "one-time"]).optional(),
  isActive: z.boolean().optional(),
});

const updatePlanSchema = createPlanSchema.partial();

// ── Middleware factory ─────────────────────────────────────────────────────────
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return res.status(422).json({ success: false, message, requestId: req.id });
  }
  req.body = result.data;
  next();
};

const validateRequest = ({ body, params, query, headers } = {}) => (req, res, next) => {
  const targets = { body, params, query, headers };
  for (const [target, schema] of Object.entries(targets)) {
    if (!schema) continue;
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${target}.${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return res.status(422).json({ success: false, message, requestId: req.id });
    }
    req[target] = result.data;
  }
  next();
};

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid identifier.");
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().max(50).optional(),
  search: z.string().max(150).optional(),
  releaseChannel: z.enum(["stable", "beta", "alpha"]).optional(),
  published: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  productId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
}).passthrough();
const customerDetailQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().max(50).optional(),
  search: z.string().max(150).optional(),
  productId: objectIdSchema.optional(),
  purpose: z.enum(["customer_download", "wordpress_update"]).optional(),
  gateway: z.enum(["stripe", "local"]).optional(),
  action: z.string().max(150).optional(),
  targetType: z.string().max(100).optional(),
}).passthrough();
const idParamSchema = z.object({ id: objectIdSchema }).passthrough();
const sessionIdParamSchema = z.object({ sessionId: z.string().min(8).max(128) }).passthrough();
const licenseIdParamSchema = z.object({ licenseId: objectIdSchema }).passthrough();
const productIdParamSchema = z.object({ productId: objectIdSchema }).passthrough();
const productPlanParamSchema = z.object({ productId: objectIdSchema, id: objectIdSchema }).passthrough();
const tokenParamSchema = z.object({ token: z.string().min(16).max(512) }).passthrough();

module.exports = {
  validate,
  validateRequest,
  objectIdSchema,
  paginationQuerySchema,
  customerDetailQuerySchema,
  idParamSchema,
  sessionIdParamSchema,
  licenseIdParamSchema,
  productIdParamSchema,
  productPlanParamSchema,
  tokenParamSchema,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileUpdateSchema,
  changePasswordSchema,
  adminUserProfileUpdateSchema,
  adminUserStatusSchema,
  adminUserEmailVerificationSchema,
  adminUserInternalNoteSchema,
  createProductSchema,
  updateProductSchema,
  updateVersionSchema,
  versionQuerySchema,
  createPlanSchema,
  updatePlanSchema,
};
