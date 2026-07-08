const express = require("express");
const { z } = require("zod");
const router = express.Router();
const c = require("../controllers/publicApiController");
const { requireApiKey, requireScope, publicError } = require("../middleware/publicApiAuth");
const { publicApiRateLimit, preventReplay } = require("../middleware/publicApiRateLimit");
const { validateRequest, idParamSchema } = require("../validators/schemas");

const analyticsQuerySchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d", "1y", "custom"]).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
}).passthrough();

router.get("/openapi", c.getOpenApi);

router.use(requireApiKey, publicApiRateLimit, preventReplay);

router.get("/products", requireScope("products.read"), c.listProducts);
router.get("/products/:id/versions", validateRequest({ params: idParamSchema }), requireScope("products.read"), c.listVersions);
router.get("/licenses", requireScope("licenses.read"), c.listLicenses);
router.get("/orders", requireScope("orders.read"), c.listOrders);
router.get("/downloads", requireScope("downloads.read"), c.listDownloads);
router.get("/customers", requireScope("customers.read"), c.listCustomers);
router.get("/activations", requireScope("licenses.read"), c.listActivations);
router.get("/analytics/summary", validateRequest({ query: analyticsQuerySchema }), requireScope("analytics.read"), c.analyticsSummary);

router.use((err, req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  const code = err.code || (status === 404 ? "NOT_FOUND" : "PUBLIC_API_ERROR");
  return publicError(res, status, code, err.message || "Public API request failed.", req.id);
});

module.exports = router;
