const asyncHandler = require("express-async-handler");
const Performance = require("../services/performance/PerformanceOptimizationService");
const Cache = require("../services/performance/CacheManager");
const Invalidation = require("../services/performance/CacheInvalidationService");
const Warmup = require("../services/performance/CacheWarmupService");
const Profiler = require("../services/performance/PerformanceProfiler");
const QueryOptimization = require("../services/performance/QueryOptimizationService");

exports.dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Performance.dashboard(), requestId: req.id });
});

exports.cache = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Cache.snapshot(), requestId: req.id });
});

exports.profiler = asyncHandler(async (req, res) => {
  res.json({ success: true, data: Profiler.snapshot(), requestId: req.id });
});

exports.queries = asyncHandler(async (req, res) => {
  res.json({ success: true, data: QueryOptimization.analyze(), requestId: req.id });
});

exports.invalidateCache = asyncHandler(async (req, res) => {
  const data = await Invalidation.invalidate({
    group: req.body?.group,
    tags: req.body?.tags || [],
    actor: req.user,
    ip: req.ip,
    requestId: req.id,
  });
  res.json({ success: true, data, requestId: req.id });
});

exports.warmCache = asyncHandler(async (req, res) => {
  const data = await Warmup.warm(req.body?.targets || []);
  res.json({ success: true, data, requestId: req.id });
});
