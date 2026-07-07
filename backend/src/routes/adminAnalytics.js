const express = require("express");
const router = express.Router();
const c = require("../controllers/adminAnalyticsController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin", "support"));

router.get("/executive", c.getExecutive);
router.get("/products", c.getProducts);
router.get("/versions", c.getVersions);
router.get("/customers", c.getCustomers);
router.get("/licenses", c.getLicenses);
router.get("/payments", c.getPayments);
router.get("/downloads", c.getDownloads);

module.exports = router;
