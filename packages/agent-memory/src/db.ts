import { Pool, type QueryResult } from "pg";

// ═══════════════════════════════════════════════════════════════════
// Database — Postgres connection + schema + query helpers
// ═══════════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  return pool.query(text, params);
}

// ── Schema migration (runs on startup) ────────────────────────────

export async function initSchema(): Promise<void> {
  console.log("[db] Running schema migration...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id          SERIAL PRIMARY KEY,
      agent       VARCHAR(20) NOT NULL,
      category    VARCHAR(50) NOT NULL,
      key         VARCHAR(100) NOT NULL,
      value       JSONB NOT NULL,
      version     INTEGER DEFAULT 1,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(agent, category, key)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id          SERIAL PRIMARY KEY,
      agent       VARCHAR(20) NOT NULL,
      action      VARCHAR(100) NOT NULL,
      input       TEXT,
      decision    TEXT NOT NULL,
      reasoning   TEXT,
      executed    BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id          VARCHAR(100) PRIMARY KEY,
      proposer    VARCHAR(20) NOT NULL,
      tool        VARCHAR(100) NOT NULL,
      args        TEXT,
      context     TEXT,
      status      VARCHAR(20) DEFAULT 'pending',
      votes       JSONB DEFAULT '{}',
      discord_msg VARCHAR(50),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS tx_executions (
      id              SERIAL PRIMARY KEY,
      proposal_id     VARCHAR(100) REFERENCES proposals(id),
      tx_hash         VARCHAR(66),
      chain_id        INTEGER NOT NULL,
      target          VARCHAR(42) NOT NULL,
      function_sig    VARCHAR(200),
      args            TEXT,
      value           VARCHAR(78) DEFAULT '0',
      status          VARCHAR(20) DEFAULT 'pending',
      gas_used        BIGINT,
      block_number    BIGINT,
      error           TEXT,
      verified        BOOLEAN DEFAULT FALSE,
      verification_data JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at    TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(agent, category);
    CREATE INDEX IF NOT EXISTS idx_decisions_agent ON decisions(agent, created_at);
    CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
    CREATE INDEX IF NOT EXISTS idx_tx_executions_proposal ON tx_executions(proposal_id);
  `);

  console.log("[db] Schema ready");
}

// ── Memory CRUD ───────────────────────────────────────────────────

export async function getMemory(agent: string, category: string, key: string) {
  const res = await query(
    "SELECT value, version, updated_at FROM memories WHERE agent = $1 AND category = $2 AND key = $3",
    [agent, category, key]
  );
  return res.rows[0] || null;
}

export async function listMemoryKeys(agent: string, category: string) {
  const res = await query(
    "SELECT key, value, version, updated_at FROM memories WHERE agent = $1 AND category = $2 ORDER BY updated_at DESC",
    [agent, category]
  );
  return res.rows;
}

export async function upsertMemory(agent: string, category: string, key: string, value: unknown) {
  const res = await query(
    `INSERT INTO memories (agent, category, key, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent, category, key)
     DO UPDATE SET value = $4, version = memories.version + 1, updated_at = NOW()
     RETURNING id, version, updated_at`,
    [agent, category, key, JSON.stringify(value)]
  );
  return res.rows[0];
}

export async function deleteMemory(agent: string, category: string, key: string) {
  const res = await query(
    "DELETE FROM memories WHERE agent = $1 AND category = $2 AND key = $3 RETURNING id",
    [agent, category, key]
  );
  return res.rowCount! > 0;
}

export async function getAllForCategory(category: string) {
  const res = await query(
    "SELECT agent, key, value, updated_at FROM memories WHERE category = $1 ORDER BY agent, key",
    [category]
  );
  return res.rows;
}

export async function getCategoryKeyAllAgents(category: string, key: string) {
  const res = await query(
    "SELECT agent, value, updated_at FROM memories WHERE category = $1 AND key = $2 ORDER BY agent",
    [category, key]
  );
  return res.rows;
}

// ── Decision log ──────────────────────────────────────────────────

export async function logDecision(
  agent: string, action: string, input: string | null,
  decision: string, reasoning: string | null, executed: boolean = false
) {
  const res = await query(
    `INSERT INTO decisions (agent, action, input, decision, reasoning, executed)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [agent, action, input, decision, reasoning, executed]
  );
  return res.rows[0];
}

export async function getDecisions(agent: string, limit: number = 50) {
  const res = await query(
    "SELECT id, action, input, decision, reasoning, executed, created_at FROM decisions WHERE agent = $1 ORDER BY created_at DESC LIMIT $2",
    [agent, limit]
  );
  return res.rows;
}

// ── Consensus proposals ───────────────────────────────────────────

export async function createProposal(
  id: string, proposer: string, tool: string,
  args: string | null, context: string | null, discordMsg: string | null
) {
  const res = await query(
    `INSERT INTO proposals (id, proposer, tool, args, context, discord_msg, votes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [id, proposer, tool, args, context, discordMsg, JSON.stringify({ [proposer]: "approve" })]
  );
  return res.rows[0];
}

export async function voteOnProposal(id: string, agent: string, vote: string) {
  const res = await query(
    `UPDATE proposals SET votes = votes || $2, resolved_at = CASE
       WHEN status != 'pending' THEN resolved_at ELSE NULL END
     WHERE id = $1
     RETURNING id, votes, status`,
    [id, JSON.stringify({ [agent]: vote })]
  );
  return res.rows[0] || null;
}

export async function getProposal(id: string) {
  const res = await query("SELECT * FROM proposals WHERE id = $1", [id]);
  return res.rows[0] || null;
}

export async function listProposals(status?: string) {
  if (status) {
    const res = await query(
      "SELECT id, proposer, tool, args, status, votes, created_at FROM proposals WHERE status = $1 ORDER BY created_at DESC",
      [status]
    );
    return res.rows;
  }
  const res = await query(
    "SELECT id, proposer, tool, args, status, votes, created_at FROM proposals ORDER BY created_at DESC LIMIT 50"
  );
  return res.rows;
}

export async function updateProposalStatus(id: string, status: string) {
  const res = await query(
    "UPDATE proposals SET status = $1, resolved_at = NOW() WHERE id = $2 RETURNING id, status",
    [status, id]
  );
  return res.rows[0] || null;
}

// ── Transaction executions ────────────────────────────────────────

export async function createTxExecution(
  proposalId: string, txHash: string | null, chainId: number,
  target: string, functionSig: string | null, args: string | null,
  value: string, status: string, gasUsed: number | null,
  blockNumber: number | null, error: string | null
) {
  const res = await query(
    `INSERT INTO tx_executions (proposal_id, tx_hash, chain_id, target, function_sig, args, value, status, gas_used, block_number, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [proposalId, txHash, chainId, target, functionSig, args, value, status, gasUsed, blockNumber, error]
  );
  return res.rows[0];
}

export async function updateTxExecution(
  id: number,
  updates: {
    tx_hash?: string; status?: string; gas_used?: number;
    block_number?: number; error?: string; verified?: boolean;
    verification_data?: unknown; confirmed_at?: string;
  }
) {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      setClauses.push(`${key} = $${idx}`);
      values.push(key === 'verification_data' ? JSON.stringify(val) : val);
      idx++;
    }
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const res = await query(
    `UPDATE tx_executions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

export async function getTxExecutionByProposal(proposalId: string) {
  const res = await query(
    "SELECT * FROM tx_executions WHERE proposal_id = $1 ORDER BY created_at DESC LIMIT 1",
    [proposalId]
  );
  return res.rows[0] || null;
}

export async function shutdown(): Promise<void> {
  await pool.end();
}
