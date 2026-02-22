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

serve({ fetch: app.fetch, port: PORT });
