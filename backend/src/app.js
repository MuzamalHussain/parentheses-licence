const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { errorHandler } = require("./utils/errorHandler");
const { getConfig } = require("./config/env");
const apiSecurityConfig = require("./config/apiSecurity");
const {
  requestContext,
  requireJsonContentType,
  apiAuditLogger,
  makeRateLimiter,
} = require("./middleware/apiSecurity");
const { performanceLogger } = require("./middleware/performanceLogger");
const healthRoutes = require("./routes/health");

const app = express();
const config = getConfig();

// Trust first proxy hop (needed behind nginx/Render/Railway for correct req.ip,
// secure cookies, and rate-limit keys to work correctly)
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
// Default helmet() covers the essentials (X-Content-Type-Options, X-Frame-Options,
// HSTS, etc). This is a pure JSON API (no HTML/script is ever served from here),
// so we additionally lock down the Content-Security-Policy to deny everything —
// there is no legitimate reason a browser should execute or load anything
// "as" this origin.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// ── Response compression ──────────────────────────────────────────────────────
app.use(compression());
app.use(requestContext);
app.use(performanceLogger);
app.use(apiAuditLogger);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Support a comma-separated list so both the customer portal/admin panel
// origin and (if hosted separately) the marketing site can call the API.
const allowedOrigins = config.cors.allowedOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser tools (curl, the WordPress plugin, server-to-server) with no Origin header
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
// CRITICAL: webhook routes must receive the raw, unparsed body to verify
// gateway signatures (Stripe + local PSP HMAC). They are mounted here,
// BEFORE express.json(), with express.raw() instead. Mounting them after
// express.json() would have already consumed/transformed the body and
// signature verification would fail on every single webhook delivery.
app.use(
  "/api/v1/webhooks",
  makeRateLimiter("webhooks"),
  express.raw({ type: "application/json", limit: apiSecurityConfig.body.webhookLimit }),
  require("./routes/webhooks")
);

app.use(express.json({ limit: apiSecurityConfig.body.jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: apiSecurityConfig.body.urlencodedLimit }));
app.use(cookieParser());
app.use(requireJsonContentType);

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.app.isDevelopment) app.use(morgan("dev"));

// ── Global rate limiter ───────────────────────────────────────────────────────
// Second layer of defense — individual routers (auth, plugin activation) also
// apply their own tighter limiters. This one is the overall ceiling per IP.
app.use(
  rateLimit({
    windowMs: apiSecurityConfig.rateLimits.global.windowMs,
    max: apiSecurityConfig.rateLimits.global.max,
    message: (req) => ({ success: false, message: "Too many requests. Please slow down.", requestId: req.id }),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Health check ──────────────────────────────────────────────────────────────
app.use(healthRoutes);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api",                       require("./routes/apiVersions"));
app.use("/api/public/v1",             require("./routes/publicApi"));
app.use("/api/v1/admin",               makeRateLimiter("admin"));
app.use("/api/v1/downloads",           makeRateLimiter("downloads"));
app.use("/api/v1/auth",                require("./routes/auth"));
app.use("/api/v1/account",             require("./routes/account"));
app.use("/api/v1/products",            require("./routes/products"));
app.use("/api/v1/admin/users",         require("./routes/adminUsers"));
app.use("/api/v1/admin/licenses",      require("./routes/adminLicenses"));
app.use("/api/v1/admin/dashboard",     require("./routes/adminDashboard"));
app.use("/api/v1/admin/analytics",     require("./routes/adminAnalytics"));
app.use("/api/v1/admin/workflows",     require("./routes/adminWorkflows"));
app.use("/api/v1/admin/domains",       require("./routes/adminDomains"));
app.use("/api/v1/admin/products/:productId/versions", require("./routes/adminVersions"));
app.use("/api/v1/admin/orders",        require("./routes/adminOrders"));
app.use("/api/v1/admin/payments",      require("./routes/adminPayments"));
app.use("/api/v1/admin/coupons",       require("./routes/adminCoupons"));
app.use("/api/v1/admin/support",       require("./routes/adminSupport"));
app.use("/api/v1/admin/audit",         require("./routes/adminAudit"));
app.use("/api/v1/admin/downloads",     require("./routes/adminDownloads"));
app.use("/api/v1/admin/notifications", require("./routes/adminNotifications"));
app.use("/api/v1/admin/settings",      require("./routes/adminSettings"));
app.use("/api/v1/admin/diagnostics",   require("./routes/adminDiagnostics"));
app.use("/api/v1/admin/operations",    require("./routes/adminOperations"));
app.use("/api/v1/admin/integrations",  require("./routes/adminIntegrations"));
app.use("/api/v1/admin/api-keys",      require("./routes/adminApiKeys"));
app.use("/api/v1/admin/webhooks",      require("./routes/adminWebhooks"));
app.use("/api/v1/admin/release-automation", require("./routes/adminReleaseAutomation"));
app.use("/api/v1/admin/developer-portal", require("./routes/adminDeveloperPortal"));
app.use("/api/v1/licenses",            require("./routes/customerLicenses"));
app.use("/api/v1/plugin",              require("./routes/plugin"));
app.use("/api/wp/updater",             require("./routes/wpUpdater"));
app.use("/api/v1",                     require("./routes/customerDownloads"));
app.use("/api/v1/orders",              require("./routes/orders"));
app.use("/api/v1/notifications",       require("./routes/notifications"));
app.use("/api/v1/support",             require("./routes/support"));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.`, requestId: req.id });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
