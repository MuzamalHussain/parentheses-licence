const asyncHandler = require("express-async-handler");
const ApiKeyService = require("../services/publicApi/ApiKeyService");

exports.listApiKeys = asyncHandler(async (req, res) => {
  const keys = await ApiKeyService.listKeys();
  res.json({ success: true, data: keys, requestId: req.id });
});

exports.createApiKey = asyncHandler(async (req, res) => {
  const result = await ApiKeyService.createKey({
    ...req.body,
    ownerId: req.body.ownerId || req.user._id,
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(201).json({
    success: true,
    data: {
      apiKey: result.apiKey,
      key: result.rawKey,
    },
    requestId: req.id,
  });
});

exports.rotateApiKey = asyncHandler(async (req, res) => {
  const result = await ApiKeyService.rotateKey(req.params.id, { actor: req.user, ip: req.ip, requestId: req.id });
  if (!result) return res.status(404).json({ success: false, message: "API key not found.", requestId: req.id });
  res.json({ success: true, data: { apiKey: result.apiKey, key: result.rawKey }, requestId: req.id });
});

exports.revokeApiKey = asyncHandler(async (req, res) => {
  const key = await ApiKeyService.revokeKey(req.params.id, { actor: req.user, ip: req.ip, requestId: req.id });
  if (!key) return res.status(404).json({ success: false, message: "API key not found.", requestId: req.id });
  res.json({ success: true, data: key, requestId: req.id });
});
