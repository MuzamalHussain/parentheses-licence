const express = require("express");
const controller = require("../controllers/wpUpdaterController");

const router = express.Router();

router.post("/check", controller.check);
router.get("/download/:token", controller.download);

module.exports = router;
