const express = require("express");
const ApiCapabilityRegistry = require("../services/integrations/ApiCapabilityRegistry");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    versions: ["v1"],
    current: "v1",
    links: {
      v1: "/api/v1",
      publicV1: "/api/public/v1",
    },
    documentation: ApiCapabilityRegistry.getDocumentationMetadata(),
    requestId: req.id,
  });
});

module.exports = router;
