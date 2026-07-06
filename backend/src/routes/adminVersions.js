const express = require("express");
const router = express.Router({ mergeParams: true }); // mounted at /admin/products/:productId/versions
const c = require("../controllers/adminVersionController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { handleUpload } = require("../middleware/upload");
const { validateRequest, idParamSchema, productIdParamSchema, updateVersionSchema, versionQuerySchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin", "support"));
router.use(validateRequest({ params: productIdParamSchema }));

router.get("/",     validateRequest({ query: versionQuerySchema }), c.getVersions);
router.get("/:id",  validateRequest({ params: idParamSchema }), c.getVersion);

router.post("/",                requireRole("admin"), handleUpload, c.uploadVersion);
router.patch("/:id",             requireRole("admin"), validateRequest({ params: idParamSchema, body: updateVersionSchema }), c.updateVersion);
router.post("/:id/publish",      requireRole("admin"), validateRequest({ params: idParamSchema }), c.publishVersion);
router.post("/:id/unpublish",    requireRole("admin"), validateRequest({ params: idParamSchema }), c.unpublishVersion);
router.post("/:id/rollback",     requireRole("admin"), validateRequest({ params: idParamSchema }), c.rollbackToVersion);
router.delete("/:id",            requireRole("admin"), validateRequest({ params: idParamSchema }), c.deleteVersion);

module.exports = router;
