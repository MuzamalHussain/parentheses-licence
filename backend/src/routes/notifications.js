const express = require("express");
const router = express.Router();
const c = require("../controllers/notificationController");
const { requireAuth } = require("../middleware/auth");
const { validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth);

router.get("/", c.getMyNotifications);
router.post("/:id/read", validateRequest({ params: idParamSchema }), c.markRead);
router.get("/preferences", c.getPreferences);
router.put("/preferences", c.updatePreferences);

module.exports = router;
