const express = require("express");
const router = express.Router();
const downloadController = require("../controllers/downloadController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateRequest, customerDetailQuerySchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/", validateRequest({ query: customerDetailQuerySchema }), downloadController.getAdminDownloadHistory);

module.exports = router;
