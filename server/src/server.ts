import type { Server } from "node:http";

import app from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/prisma.js";
import { closeSocketServer, initSocketServer } from "./socket/index.js";
import { storage } from "./utils/storage.js";

/**
 * Starts the HTTP server only after the database is confirmed reachable.
 * Binding the port first would let the service advertise itself as healthy
 * while every request that touches data fails.
 */
const start = async (): Promise<void> => {
  try {
    await connectDatabase();
    console.log("✅ Database connected");

    // Created at boot so the first upload cannot fail on a missing directory.
    await storage.init();
  } catch (error) {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  }

  const server: Server = app.listen(config.port, () => {
    console.log(
      `🚀 Server running on http://localhost:${config.port} [${config.env}]`
    );
  });

  // Socket.io shares the HTTP server rather than binding its own port, so
  // WebSocket upgrades arrive on the same origin as the REST API and need no
  // extra CORS or firewall configuration.
  initSocketServer(server);
  console.log("📡 Socket.io ready");

  /**
   * Graceful shutdown: stop accepting new connections, finish in-flight
   * requests, then release the database pool. Without this, a container
   * restart drops requests mid-flight and leaks Postgres connections.
   */
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    server.close(async () => {
      await closeSocketServer();
      await disconnectDatabase();
      console.log("Closed out remaining connections.");
      process.exit(0);
    });

    // Failsafe: if in-flight requests hang, exit anyway rather than block
    // the orchestrator's restart indefinitely.
    setTimeout(() => {
      console.error("Forcing shutdown after timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

void start();
