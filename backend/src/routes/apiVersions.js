const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    versions: ["v1"],
    current: "v1",
    links: {
      v1: "/api/v1",
    },
    requestId: req.id,
  });
});

module.exports = router;
