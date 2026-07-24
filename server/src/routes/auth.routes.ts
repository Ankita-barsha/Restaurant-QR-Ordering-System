import { Router } from "express";

import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, refreshSchema } from "../validations/auth.validation.js";

const router = Router();

/**
 * Route definitions read as a security specification: for each endpoint, the
 * middleware chain states exactly what is required to reach the handler.
 *
 * Order matters — validate before the controller, authenticate before any
 * handler that reads req.user.
 */

// Public: no token required.
router.post("/login", authLimiter, validate({ body: loginSchema }), authController.login);
router.post("/refresh", authLimiter, validate({ body: refreshSchema }), authController.refresh);
router.post("/logout", authController.logout);

// Protected: a valid access token is required.
router.post("/logout-all", authenticate, authController.logoutAll);
router.get("/me", authenticate, authController.me);

export default router;
