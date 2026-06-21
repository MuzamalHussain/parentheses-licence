const express = require("express");
const router = express.Router({ mergeParams: true }); // mounted at /admin/products/:productId/versions
const c = require("../controllers/adminVersionController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { handleUpload } = require("../middleware/upload");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/",     c.getVersions);
router.get("/:id",  c.getVersion);

router.post("/",                requireRole("admin"), handleUpload, c.uploadVersion);
router.patch("/:id",             requireRole("admin"), c.updateVersion);
router.post("/:id/publish",      requireRole("admin"), c.publishVersion);
router.post("/:id/unpublish",    requireRole("admin"), c.unpublishVersion);
router.post("/:id/rollback",     requireRole("admin"), c.rollbackToVersion);
router.delete("/:id",            requireRole("admin"), c.deleteVersion);

module.exports = router;
