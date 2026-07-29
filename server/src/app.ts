import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { config } from "./config/env.js";
import docsRouter from "./docs/router.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter, securityHeaders } from "./middleware/security.js";
import apiRoutes from "./routes/index.js";
import { storage } from "./utils/storage.js";

const app = express();

// Express sits behind a reverse proxy in production (nginx, a load balancer).
// Without this, req.ip reports the proxy's address and every audit log and
// rate limit records the same IP for every user.
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * `credentials: true` plus an explicit origin is required for the refresh
 * cookie to cross from the Vite dev server to this API. Browsers refuse to
 * send credentials to a wildcard origin, so `*` would silently break login.
 */
// Security headers first, so they are present even on responses produced by
// middleware that runs later (including error responses).
app.use(securityHeaders);

// gzip. Menu payloads with descriptions compress to roughly a fifth.
app.use(compression());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.isDevelopment || config.security.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Body size caps: the default is 100kb, but stating it makes the limit a
// deliberate decision rather than an inherited default.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Parses the httpOnly refresh cookie into req.cookies.
app.use(cookieParser());

/**
 * Serves uploaded images.
 *
 * `index: false` and `dotfiles: "deny"` stop the directory being browsable and
 * block access to dotfiles. Long cache headers are safe because filenames are
 * random and never reused, so a changed image is always a new URL.
 */
app.use(
  config.upload.publicPath,
  express.static(storage.root, {
    index: false,
    dotfiles: "deny",
    maxAge: "7d",
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Restaurant QR Ordering API by MONK DEVELOPER is running 🚀",
    developedBy: "MONK DEVELOPER",
  });
});

/**
 * API documentation.
 *
 * Mounted BEFORE the rate limiter: Swagger UI pulls several static assets on
 * every page load, and spending the caller's request budget on stylesheets
 * would mean opening the docs could rate-limit the API calls you opened them
 * to make.
 *
 * Registered before "/api" so the more specific path wins — Express matches in
 * order, and the API router would otherwise 404 on /api/docs first.
 */
if (config.docs.enabled) {
  app.use(config.docs.path, docsRouter);
}

app.use("/api", apiLimiter, apiRoutes);

// ---------------------------------------------------------------------------
// Error handling — must stay LAST.
//
// Express runs middleware in registration order. Registering these before the
// routes would make every request 404, because the handler would match first.
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
