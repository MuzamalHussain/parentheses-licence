const express = require("express");
const router = express.Router();
const adminUserController = require("../controllers/adminUserController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { z } = require("zod");
const { validate, validateRequest, idParamSchema } = require("../validators/schemas");

router.use(requireAuth, requireRole("admin"));

const roleSchema = z.object({ role: z.enum(["customer", "admin", "support"]) });

router.get("/", adminUserController.getUsers);
router.get("/:id", validateRequest({ params: idParamSchema }), adminUserController.getUser);
router.patch("/:id/role", validateRequest({ params: idParamSchema }), validate(roleSchema), adminUserController.updateRole);
router.patch("/:id/toggle-active", validateRequest({ params: idParamSchema }), adminUserController.toggleActive);

module.exports = router;
