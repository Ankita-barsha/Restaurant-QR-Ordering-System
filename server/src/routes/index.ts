/**
 * API router.
 *
 * One place where every feature module is mounted, so app.ts never grows a
 * list of imports and the URL layout is readable in a single file.
 */

import { Router } from "express";

import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import categoryRoutes from "./category.routes.js";
import foodRoutes from "./food.routes.js";
import notificationRoutes from "./notification.routes.js";
import orderRoutes from "./order.routes.js";
import paymentRoutes from "./payment.routes.js";
import reservationRoutes from "./reservation.routes.js";
import tableRoutes from "./table.routes.js";

const router = Router();

import * as adminController from "../controllers/admin.controller.js";

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

/** PUBLIC — restaurant name, currency and hours for the customer app. */
router.get("/settings", adminController.getPublicSettings);

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);
router.use("/foods", foodRoutes);
router.use("/orders", orderRoutes);
router.use("/notifications", notificationRoutes);
router.use("/payments", paymentRoutes);
router.use("/reservations", reservationRoutes);
router.use("/tables", tableRoutes);

// Feature routers are mounted here as they are built.

export default router;
