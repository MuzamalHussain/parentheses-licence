const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const planController = require("../controllers/planController");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  validate,
  validateRequest,
  createProductSchema,
  updateProductSchema,
  createPlanSchema,
  updatePlanSchema,
  idParamSchema,
  paginationQuerySchema,
  productIdParamSchema,
  productPlanParamSchema,
} = require("../validators/schemas");

// Optional auth — controller decides what to expose based on role
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  try {
    const { verifyAccessToken } = require("../utils/jwt");
    const User = require("../models/User");
    const decoded = verifyAccessToken(token);
    User.findById(decoded.id).then((u) => { req.user = u; next(); }).catch(() => next());
  } catch { next(); }
};

// ── Public product reads ──────────────────────────────────────────────────────
router.get("/", optionalAuth, validateRequest({ query: paginationQuerySchema }), productController.getProducts);
router.get("/:id", optionalAuth, validateRequest({ params: idParamSchema }), productController.getProduct);

// ── Public plan reads ─────────────────────────────────────────────────────────
router.get("/:productId/plans", optionalAuth, validateRequest({ params: productIdParamSchema }), planController.getPlans);
router.get("/:productId/plans/:id", optionalAuth, validateRequest({ params: productPlanParamSchema }), planController.getPlan);

// ── Admin product writes ──────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("admin"), validate(createProductSchema), productController.createProduct);
router.patch("/:id", requireAuth, requireRole("admin"), validateRequest({ params: idParamSchema }), validate(updateProductSchema), productController.updateProduct);
router.delete("/:id", requireAuth, requireRole("admin"), validateRequest({ params: idParamSchema }), productController.deleteProduct);

// ── Admin plan writes ─────────────────────────────────────────────────────────
router.post("/:productId/plans", requireAuth, requireRole("admin"), validateRequest({ params: productIdParamSchema }), validate(createPlanSchema), planController.createPlan);
router.patch("/:productId/plans/:id", requireAuth, requireRole("admin"), validateRequest({ params: productPlanParamSchema }), validate(updatePlanSchema), planController.updatePlan);
router.delete("/:productId/plans/:id", requireAuth, requireRole("admin"), validateRequest({ params: productPlanParamSchema }), planController.deletePlan);

module.exports = router;
