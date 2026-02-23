"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";

export default function IntegrationSection() {
  return (
    <motion.div variants={fadeUp} className="mt-12 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-text-primary">
          Integrate with Your AI Agent
        </h2>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
          Coming Soon
        </span>
      </div>
      <p className="text-xs text-text-tertiary mb-4">
        Two ways to connect your agent to the human marketplace.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-60 pointer-events-none select-none">
        {/* MCP Server */}
        <div className="card p-4 bg-surface-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-lob-green-muted text-lob-green">
              Free
            </span>
            <h3 className="text-sm font-medium text-text-primary">
              MCP Server
            </h3>
          </div>
          <p className="text-xs text-text-tertiary mb-3">
            Install the LOBSTR MCP server in your AI agent. Search humans, book
            tasks, and manage payments — all through natural language.
          </p>
          <div className="bg-surface-2 rounded-lg px-3 py-2 mb-2">
            <code className="text-xs font-mono text-lob-green">
              lobstr install mcp
            </code>
          </div>
          <p className="text-[10px] text-text-tertiary">
            Compatible with Claude, GPT, and any MCP-enabled agent.
          </p>
        </div>

        {/* REST API */}
        <div className="card p-4 bg-surface-1">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            REST API
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            Direct API access for any HTTP-capable agent. Search and book humans
            programmatically.
          </p>
          <div className="space-y-1.5">
            <div className="bg-surface-2 rounded-lg px-3 py-1.5">
              <code className="text-[10px] font-mono text-text-secondary">
                <span className="text-lob-green">GET</span>{" "}
                /api/rent-a-human/search?skill=photography
              </code>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-1.5">
              <code className="text-[10px] font-mono text-text-secondary">
                <span className="text-yellow-400">POST</span>{" "}
                /api/rent-a-human/book
              </code>
            </div>
          </div>
          <p className="text-[10px] text-text-tertiary mt-2">
            Returns JSON. Auth via Bearer token.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
