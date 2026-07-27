/**
 * Serves the API documentation.
 *
 *   GET /api/docs              interactive Swagger UI
 *   GET /api/docs/openapi.json the raw OpenAPI 3.1 document
 *
 * Swagger UI's assets are served from the installed `swagger-ui-dist` package
 * rather than a CDN. A CDN would be one line shorter and would break the docs
 * on any network that cannot reach it — and would hand a third party the
 * ability to run scripts on a page that holds a staff access token.
 */

import express, { Router } from "express";
import { getAbsoluteFSPath } from "swagger-ui-dist";

import { config } from "../config/env.js";
import { openApiJson } from "./openapi.js";

const router = Router();

/**
 * The raw document. Point Postman, Insomnia, or a client generator at this.
 * Registered before the static handler so the filename cannot be shadowed by
 * anything shipped inside swagger-ui-dist.
 */
router.get("/openapi.json", (_req, res) => {
  res.type("application/json").send(openApiJson);
});

/**
 * The page itself.
 *
 * Written by hand rather than using swagger-ui-dist's bundled index.html,
 * because that one points at the Swagger Petstore sample and has to be
 * rewritten anyway. `persistAuthorization` keeps the bearer token across
 * reloads, so trying a few endpoints does not mean pasting it each time.
 *
 * Asset URLs are ABSOLUTE, built from the mount path. Relative ones ("./x.css")
 * resolve against the directory of the current URL, so they broke the moment
 * the page was opened at /api/docs rather than /api/docs/ — the browser asked
 * for /api/swagger-ui.css, got the API's 404 JSON, and rendered a blank page.
 */
const base = config.docs.path.replace(/\/$/, "");

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Restaurant QR Ordering API</title>
    <!-- Inline, so the page does not 404 on a favicon this API does not serve. -->
    <link rel="icon" href="data:image/svg+xml,&lt;svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'&gt;&lt;text y='26' font-size='26'&gt;🍽️&lt;/text&gt;&lt;/svg&gt;" />
    <link rel="stylesheet" href="${base}/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger"></div>
    <script src="${base}/swagger-ui-bundle.js"></script>
    <script src="${base}/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${base}/openapi.json",
        dom_id: "#swagger",
        deepLinking: true,
        // Survives a reload, so exploring does not mean re-pasting the token.
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tryItOutEnabled: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "BaseLayout",
      });
    </script>
  </body>
</html>`;

router.get("/", (_req, res) => {
  res.type("html").send(page);
});

/**
 * Swagger UI's own CSS and JavaScript.
 *
 * `index: false` stops the package's stock index.html being served in place of
 * the page above, and keeps the directory unbrowsable.
 */
router.use(
  express.static(getAbsoluteFSPath(), {
    index: false,
    dotfiles: "deny",
    maxAge: config.isProduction ? "7d" : 0,
  })
);

export default router;
