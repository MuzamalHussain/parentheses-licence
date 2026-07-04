const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");
const { requireAuth } = require("../middleware/auth");
const { validate, profileUpdateSchema, changePasswordSchema } = require("../validators/schemas");

router.use(requireAuth);

router.get("/profile", accountController.getProfile);
router.patch("/profile", validate(profileUpdateSchema), accountController.updateProfile);
router.post("/change-password", validate(changePasswordSchema), accountController.changePassword);

module.exports = router;
