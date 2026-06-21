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
    return res.status(422).json({ success: false, message });
  }
  req.body = result.data;
  next();
};

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createProductSchema,
  updateProductSchema,
  createPlanSchema,
  updatePlanSchema,
};
