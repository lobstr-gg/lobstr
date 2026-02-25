import express, { type Request, type Response, type NextFunction } from "express";
import * as db from "./db";

// ═══════════════════════════════════════════════════════════════════
// LOBSTR Agent Memory Service
// ═══════════════════════════════════════════════════════════════════
// Lightweight Express API backed by Postgres. Each agent has its own
// namespace. Agents can read each other's state for cross-domain
// awareness but can only write to their own namespace.
// ═══════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Agent API keys — maps key → agent name ──────────────────────
// Keys are set via env vars: AGENT_KEY_SENTINEL, AGENT_KEY_ARBITER, AGENT_KEY_STEWARD
const AGENT_KEYS = new Map<string, string>();

function loadAgentKeys() {
  const agents = ["sentinel", "arbiter", "steward"];
  for (const agent of agents) {
    const key = process.env[`AGENT_KEY_${agent.toUpperCase()}`];
    if (key) {
      AGENT_KEYS.set(key, agent);
      console.log(`[memory] API key loaded for ${agent}`);
    }
  }
  if (AGENT_KEYS.size === 0) {
    console.warn("[memory] WARNING: No agent API keys configured — auth disabled (dev mode)");
  }
}

// ── Auth middleware ──────────────────────────────────────────────
function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Dev mode: no keys configured → skip auth
  if (AGENT_KEYS.size === 0) {
    (req as any).agent = req.headers["x-agent-name"] as string || "dev";
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const agent = AGENT_KEYS.get(token);
  if (!agent) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  (req as any).agent = agent;
  next();
}

// ── Param extraction helper (Express 5 params can be string|string[]) ─
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ── Write guard — agents can only write to their own namespace ───
function ownNamespaceOnly(req: Request, res: Response, next: NextFunction): void {
  const callerAgent = (req as any).agent;
  const targetAgent = param(req, "agent");
  if (callerAgent !== targetAgent && callerAgent !== "dev") {
    res.status(403).json({ error: `Agent '${callerAgent}' cannot write to '${targetAgent}' namespace` });
    return;
  }
  next();
}

// ── Param validation ────────────────────────────────────────────
const VALID_AGENTS = new Set(["sentinel", "arbiter", "steward"]);
const MAX_CATEGORY_LEN = 50;
const MAX_KEY_LEN = 100;

function validateAgent(agent: string): boolean {
  return VALID_AGENTS.has(agent);
}

function validateCategory(cat: string): boolean {
  return cat.length <= MAX_CATEGORY_LEN && /^[a-zA-Z0-9_-]+$/.test(cat);
}

function validateKey(key: string): boolean {
  return key.length <= MAX_KEY_LEN && /^[a-zA-Z0-9_.-]+$/.test(key);
}

// ═══════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── Health ──────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", service: "lobstr-memory", timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

// ── Cross-agent reads (registered FIRST — "all" must not match :agent) ─
app.get("/memory/all/:category", authenticate, (req: Request, res: Response) => {
  const category = param(req, "category");
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }

  db.getAllForCategory(category)
    .then((rows) => res.json(rows))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.get("/memory/all/:category/:key", authenticate, (req: Request, res: Response) => {
  const category = param(req, "category");
  const key = param(req, "key");
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }
  if (!validateKey(key)) { res.status(400).json({ error: "Invalid key" }); return; }

  db.getCategoryKeyAllAgents(category, key)
    .then((rows) => res.json(rows))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Memory: list keys in category ───────────────────────────────
app.get("/memory/:agent/:category", authenticate, (req: Request, res: Response) => {
  const agent = param(req, "agent");
  const category = param(req, "category");
  if (!validateAgent(agent)) { res.status(400).json({ error: "Invalid agent" }); return; }
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }

  db.listMemoryKeys(agent, category)
    .then((rows) => res.json(rows))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Memory: get value ───────────────────────────────────────────
app.get("/memory/:agent/:category/:key", authenticate, (req: Request, res: Response) => {
  const agent = param(req, "agent");
  const category = param(req, "category");
  const key = param(req, "key");
  if (!validateAgent(agent)) { res.status(400).json({ error: "Invalid agent" }); return; }
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }
  if (!validateKey(key)) { res.status(400).json({ error: "Invalid key" }); return; }

  db.getMemory(agent, category, key)
    .then((row) => row ? res.json(row) : res.status(404).json({ error: "Not found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Memory: upsert (own namespace only) ─────────────────────────
app.put("/memory/:agent/:category/:key", authenticate, ownNamespaceOnly, (req: Request, res: Response) => {
  const agent = param(req, "agent");
  const category = param(req, "category");
  const key = param(req, "key");
  if (!validateAgent(agent)) { res.status(400).json({ error: "Invalid agent" }); return; }
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }
  if (!validateKey(key)) { res.status(400).json({ error: "Invalid key" }); return; }
  if (req.body.value === undefined) { res.status(400).json({ error: "Missing 'value' in body" }); return; }

  db.upsertMemory(agent, category, key, req.body.value)
    .then((row) => res.json(row))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Memory: delete (own namespace only) ─────────────────────────
app.delete("/memory/:agent/:category/:key", authenticate, ownNamespaceOnly, (req: Request, res: Response) => {
  const agent = param(req, "agent");
  const category = param(req, "category");
  const key = param(req, "key");
  if (!validateAgent(agent)) { res.status(400).json({ error: "Invalid agent" }); return; }
  if (!validateCategory(category)) { res.status(400).json({ error: "Invalid category" }); return; }
  if (!validateKey(key)) { res.status(400).json({ error: "Invalid key" }); return; }

  db.deleteMemory(agent, category, key)
    .then((deleted) => deleted ? res.json({ deleted: true }) : res.status(404).json({ error: "Not found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Decision log ────────────────────────────────────────────────
app.post("/decisions", authenticate, (req: Request, res: Response) => {
  const agent = (req as any).agent as string;
  const { action, input, decision, reasoning, executed } = req.body;
  if (!action || !decision) { res.status(400).json({ error: "Missing 'action' and 'decision'" }); return; }

  db.logDecision(agent, action, input || null, decision, reasoning || null, executed || false)
    .then((row) => res.status(201).json(row))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.get("/decisions/:agent", authenticate, (req: Request, res: Response) => {
  const agent = param(req, "agent");
  if (!validateAgent(agent)) { res.status(400).json({ error: "Invalid agent" }); return; }
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

  db.getDecisions(agent, limit)
    .then((rows) => res.json(rows))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Consensus proposals ─────────────────────────────────────────
app.post("/proposals", authenticate, (req: Request, res: Response) => {
  const proposer = (req as any).agent as string;
  const { tool, args, context, discord_msg } = req.body;
  if (!tool) { res.status(400).json({ error: "Missing 'tool'" }); return; }

  const id = `prop-${Date.now()}-${proposer}`;
  db.createProposal(id, proposer, tool, args || null, context || null, discord_msg || null)
    .then((row) => res.status(201).json(row))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.patch("/proposals/:id/vote", authenticate, (req: Request, res: Response) => {
  const agent = (req as any).agent as string;
  const id = param(req, "id");
  const { vote } = req.body;
  if (!vote || !["approve", "deny"].includes(vote)) {
    res.status(400).json({ error: "Vote must be 'approve' or 'deny'" });
    return;
  }

  db.voteOnProposal(id, agent, vote)
    .then((row) => row ? res.json(row) : res.status(404).json({ error: "Proposal not found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.get("/proposals", authenticate, (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  db.listProposals(status)
    .then((rows) => res.json(rows))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.get("/proposals/:id", authenticate, (req: Request, res: Response) => {
  const id = param(req, "id");
  db.getProposal(id)
    .then((row) => row ? res.json(row) : res.status(404).json({ error: "Proposal not found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.patch("/proposals/:id/status", authenticate, (req: Request, res: Response) => {
  const id = param(req, "id");
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "Missing 'status'" }); return; }

  db.updateProposalStatus(id, status)
    .then((row) => row ? res.json(row) : res.status(404).json({ error: "Proposal not found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ── Transaction executions ──────────────────────────────────────
app.post("/executions", authenticate, (req: Request, res: Response) => {
  const { proposal_id, tx_hash, chain_id, target, function_sig, args, value, status, gas_used, block_number, error } = req.body;
  if (!proposal_id || !chain_id || !target) {
    res.status(400).json({ error: "Missing required fields: proposal_id, chain_id, target" });
    return;
  }

  db.createTxExecution(
    proposal_id, tx_hash || null, chain_id, target,
    function_sig || null, args || null, value || '0',
    status || 'pending', gas_used || null, block_number || null, error || null
  )
    .then((row) => res.status(201).json(row))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

app.get("/executions/:proposalId", authenticate, (req: Request, res: Response) => {
  const proposalId = param(req, "proposalId");
  db.getTxExecutionByProposal(proposalId)
    .then((row) => row ? res.json(row) : res.status(404).json({ error: "No execution found" }))
    .catch((err: any) => res.status(500).json({ error: err.message }));
});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════

async function start() {
  loadAgentKeys();
  await db.initSchema();

  app.listen(PORT, () => {
    console.log(`[memory] LOBSTR Agent Memory Service running on port ${PORT}`);
  });
}

process.on("SIGTERM", async () => {
  console.log("[memory] Shutting down...");
  await db.shutdown();
  process.exit(0);
});

start().catch((err) => {
  console.error("[memory] Fatal:", err);
  process.exit(1);
});
