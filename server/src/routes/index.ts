/**
 * API router.
 *
 * One place where every feature module is mounted, so app.ts never grows a
 * list of imports and the URL layout is readable in a single file.
 */

import { Router } from "express";

import authRoutes from "./auth.routes.js";
import categoryRoutes from "./category.routes.js";
import foodRoutes from "./food.routes.js";
import orderRoutes from "./order.routes.js";
import tableRoutes from "./table.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/foods", foodRoutes);
router.use("/orders", orderRoutes);
router.use("/tables", tableRoutes);

// Feature routers are mounted here as they are built.

export default router;
