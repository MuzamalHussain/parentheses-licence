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

// ── Products ─────────────────────────────────────────────────────────────────
const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  slug: z.string().max(150).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const updateProductSchema = createProductSchema.partial();

// ── Plans ─────────────────────────────────────────────────────────────────────
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  allowedSites: z.number().int().min(0),
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
  productId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
}).passthrough();
const idParamSchema = z.object({ id: objectIdSchema }).passthrough();
const licenseIdParamSchema = z.object({ licenseId: objectIdSchema }).passthrough();
const productIdParamSchema = z.object({ productId: objectIdSchema }).passthrough();
const productPlanParamSchema = z.object({ productId: objectIdSchema, id: objectIdSchema }).passthrough();
const tokenParamSchema = z.object({ token: z.string().min(16).max(512) }).passthrough();

module.exports = {
  validate,
  validateRequest,
  objectIdSchema,
  paginationQuerySchema,
  idParamSchema,
  licenseIdParamSchema,
  productIdParamSchema,
  productPlanParamSchema,
  tokenParamSchema,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createProductSchema,
  updateProductSchema,
  createPlanSchema,
  updatePlanSchema,
};
