const express = require("express");
const router = express.Router();
const versionController = require("../controllers/customerVersionController");
const downloadController = require("../controllers/downloadController");
const { requireAuth } = require("../middleware/auth");
const { validateRequest, productIdParamSchema, tokenParamSchema } = require("../validators/schemas");

// ── Versions (entitlement-gated changelog/version info) ──────────────────────
router.get("/products/:productId/versions", requireAuth, validateRequest({ params: productIdParamSchema }), versionController.getMyAvailableVersions);

// ── Downloads ──────────────────────────────────────────────────────────────────
router.post("/downloads/request",  requireAuth, downloadController.requestDownload);
router.get("/downloads/history",   requireAuth, downloadController.getMyDownloadHistory);

// File serving — token IS the credential, deliberately no requireAuth here
router.get("/downloads/file/:token", validateRequest({ params: tokenParamSchema }), downloadController.serveFile);

module.exports = router;
