const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { errorHandler } = require("./utils/errorHandler");
const { getConfig } = require("./config/env");

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
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
// CRITICAL: webhook routes must receive the raw, unparsed body to verify
// gateway signatures (Stripe + local PSP HMAC). They are mounted here,
// BEFORE express.json(), with express.raw() instead. Mounting them after
// express.json() would have already consumed/transformed the body and
// signature verification would fail on every single webhook delivery.
app.use("/api/v1/webhooks", express.raw({ type: "application/json" }), require("./routes/webhooks"));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.app.isDevelopment) app.use(morgan("dev"));

// ── Global rate limiter ───────────────────────────────────────────────────────
// Second layer of defense — individual routers (auth, plugin activation) also
// apply their own tighter limiters. This one is the overall ceiling per IP.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { success: false, message: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ success: true, message: "API is running.", env: config.app.nodeEnv });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/auth",                require("./routes/auth"));
app.use("/api/v1/products",            require("./routes/products"));
app.use("/api/v1/admin/users",         require("./routes/adminUsers"));
app.use("/api/v1/admin/licenses",      require("./routes/adminLicenses"));
app.use("/api/v1/admin/dashboard",     require("./routes/adminDashboard"));
app.use("/api/v1/admin/domains",       require("./routes/adminDomains"));
app.use("/api/v1/admin/products/:productId/versions", require("./routes/adminVersions"));
app.use("/api/v1/admin/orders",        require("./routes/adminOrders"));
app.use("/api/v1/admin/coupons",       require("./routes/adminCoupons"));
app.use("/api/v1/admin/support",       require("./routes/adminSupport"));
app.use("/api/v1/admin/audit",         require("./routes/adminAudit"));
app.use("/api/v1/admin/settings",      require("./routes/adminSettings"));
app.use("/api/v1/licenses",            require("./routes/customerLicenses"));
app.use("/api/v1/plugin",              require("./routes/plugin"));
app.use("/api/v1",                     require("./routes/customerDownloads"));
app.use("/api/v1/orders",              require("./routes/orders"));
app.use("/api/v1/support",             require("./routes/support"));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
