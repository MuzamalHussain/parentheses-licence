const express = require("express");
const router = express.Router();
const c = require("../controllers/brandController");
const { requireAuth } = require("../middleware/auth");

router.get("/public", c.publicBrand);

router.use(requireAuth);
router.get("/:organizationId", c.getBrand);
router.patch("/:organizationId", c.updateBrand);
router.patch("/:organizationId/assets/:field", c.updateAsset);
router.post("/:organizationId/reset", c.resetBrand);

module.exports = router;
