import express from "express";
import cors from "cors";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Restaurant QR Ordering API is running 🚀",
  });
});

// Feature routers are mounted here in later steps.

// ---------------------------------------------------------------------------
// Error handling — must stay LAST.
//
// Express runs middleware in registration order. Registering these before the
// routes would make every request 404, because the handler would match first.
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
