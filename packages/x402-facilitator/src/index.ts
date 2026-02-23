import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { PORT, CAIP2_NETWORK, NETWORK } from "./config.js";
import { buildFacilitator } from "./facilitator.js";
import { supportedHandler } from "./routes/supported.js";
import { verifyHandler } from "./routes/verify.js";
import { settleHandler } from "./routes/settle.js";

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("*", cors());
app.use("*", logger());

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok", network: CAIP2_NETWORK }));

// ─── Facilitator Routes ──────────────────────────────────────────────────────

const facilitator = buildFacilitator();

app.get("/supported", supportedHandler(facilitator));
app.post("/verify", verifyHandler(facilitator));
app.post("/settle", settleHandler(facilitator));

// ─── Start ───────────────────────────────────────────────────────────────────

console.log(`[x402-facilitator] Starting on port ${PORT} (${NETWORK} / ${CAIP2_NETWORK})`);

const server = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });

// Graceful shutdown for Railway/Docker deploys
function shutdown(signal: string) {
  console.log(`[x402-facilitator] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log("[x402-facilitator] Server closed.");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.error("[x402-facilitator] Forcing exit after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
