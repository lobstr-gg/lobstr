"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

interface SybilFlag {
  address: string;
  signals: string[];
  txHashes: string[];
  score: number;
  createdAt: number;
  status: "pending" | "reported";
}

const SIGNAL_COLORS: Record<string, { bg: string; text: string }> = {
  "Shared Funding Source": { bg: "bg-red-500/10", text: "text-red-400" },
  "Creation Timing Cluster": { bg: "bg-amber-500/10", text: "text-amber-400" },
  "Templated Reviews": { bg: "bg-purple-500/10", text: "text-purple-400" },
  "Circular Transfers": { bg: "bg-orange-500/10", text: "text-orange-400" },
  "Copy-Paste Profile": { bg: "bg-blue-500/10", text: "text-blue-400" },
  "Single-Service Engagement": { bg: "bg-cyan-500/10", text: "text-cyan-400" },
};

function getSignalColor(signal: string) {
  return SIGNAL_COLORS[signal] ?? { bg: "bg-surface-3", text: "text-text-secondary" };
}

export default function SybilPrefilter() {
  const [flags, setFlags] = useState<SybilFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingAddress, setReportingAddress] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/forum/mod/sybil-flags", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setFlags(data.flags ?? []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleCreateReport = async (flag: SybilFlag) => {
    setReportingAddress(flag.address);
    try {
      const res = await fetch("/api/forum/mod/sybil-report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: flag.address,
          signals: flag.signals,
          txHashes: flag.txHashes,
          score: flag.score,
        }),
      });
      if (res.ok) {
        // Mark as reported locally
        setFlags((prev) =>
          prev.map((f) =>
            f.address === flag.address ? { ...f, status: "reported" as const } : f
          )
        );
      }
    } catch {
      // Ignore
    } finally {
      setReportingAddress(null);
    }
  };

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <p className="text-xs text-text-tertiary">Loading sybil prefilter data...</p>
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-secondary">No flagged accounts</p>
        <p className="text-xs text-text-tertiary mt-1">
          Accounts flagged by automated heuristics will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-tertiary">
          {flags.length} flagged account{flags.length !== 1 ? "s" : ""}
        </p>
      </div>

      {flags.map((flag, i) => (
        <motion.div
          key={flag.address}
          className="card p-4 space-y-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, ease }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-text-primary">
                {flag.address.slice(0, 6)}...{flag.address.slice(-4)}
              </span>
              {flag.status === "reported" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-lob-green-muted text-lob-green border border-lob-green/20">
                  Reported
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary tabular-nums">
                Score: {flag.score}
              </span>
              <span className="text-[10px] text-text-tertiary">
                {new Date(flag.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Signal badges */}
          <div className="flex flex-wrap gap-1.5">
            {flag.signals.map((signal) => {
              const color = getSignalColor(signal);
              return (
                <span
                  key={signal}
                  className={`text-[10px] px-2 py-0.5 rounded ${color.bg} ${color.text}`}
                >
                  {signal}
                </span>
              );
            })}
          </div>

          {/* Transaction hashes */}
          {flag.txHashes.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                Transactions
              </p>
              <div className="flex flex-wrap gap-1">
                {flag.txHashes.slice(0, 5).map((hash) => (
                  <a
                    key={hash}
                    href={`https://basescan.org/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-lob-green hover:underline"
                  >
                    {hash.slice(0, 10)}...
                  </a>
                ))}
                {flag.txHashes.length > 5 && (
                  <span className="text-[10px] text-text-tertiary">
                    +{flag.txHashes.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action */}
          {flag.status === "pending" && (
            <motion.button
              onClick={() => handleCreateReport(flag)}
              disabled={reportingAddress === flag.address}
              className="text-xs px-3 py-1.5 rounded border border-lob-red/30 text-lob-red bg-lob-red/10 hover:bg-lob-red/20 transition-colors disabled:opacity-40"
              whileTap={{ scale: 0.95 }}
            >
              {reportingAddress === flag.address
                ? "Creating Report..."
                : "Create SybilGuard Report"}
            </motion.button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
