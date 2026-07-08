const express = require("express");
const router = express.Router();
const c = require("../controllers/adminDeveloperPortalController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.dashboard);
router.get("/openapi", c.openapi);
router.get("/postman/collection", c.postmanCollection);
router.get("/postman/environment", c.postmanEnvironment);
router.get("/search", c.search);
router.post("/sandbox/execute", c.sandboxExecute);

module.exports = router;
