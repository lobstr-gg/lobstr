"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Clock, FileText, Eye, Vote, Gavel, AlertTriangle } from "lucide-react";

interface DisputeTimelineProps {
  status: number; // 0=Open, 1=EvidencePhase, 2=Voting, 3=Resolved
  createdAt: number; // unix seconds
  counterEvidenceDeadline: number; // unix seconds
}

const PHASE_COLORS: Record<string, string> = {
  complete: "#58B059",
  active: "#F59E0B",
  pending: "#2A3142",
};

const PHASES = [
  { label: "Opened", key: 0, icon: FileText, color: "#F59E0B" },
  { label: "Evidence", key: 1, icon: Eye, color: "#3B82F6" },
  { label: "Counter-Evidence", key: 1.5, icon: Clock, color: "#3B82F6" },
  { label: "Voting", key: 2, icon: Vote, color: "#A855F7" },
  { label: "Resolved", key: 3, icon: Gavel, color: "#58B059" },
];

// Evidence phase is 24h, voting is 3 days
const EVIDENCE_DURATION = 24 * 60 * 60;
const VOTING_DURATION = 3 * 24 * 60 * 60;

function formatTimestamp(unix: number): string {
  if (!unix) return "--";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRemaining(secs: number): string {
  if (secs <= 0) return "Expired";
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

/* ---- Phase Progress Indicator ---- */
function PhaseProgress({ label, elapsed, total, color }: { label: string; elapsed: number; total: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const remaining = total - elapsed;

  return (
    <div className="rounded-lg border border-border/40 bg-surface-1/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">{label}</span>
        <span className="text-[10px] tabular-nums" style={{ color }}>
          {remaining > 0 ? formatRemaining(remaining) : "Complete"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[8px] text-text-tertiary">Start</span>
        <span className="text-[8px] text-text-tertiary tabular-nums">{Math.round(pct)}%</span>
        <span className="text-[8px] text-text-tertiary">End</span>
      </div>
    </div>
  );
}

export default function DisputeTimeline({ status, createdAt, counterEvidenceDeadline }: DisputeTimelineProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const counterEvidenceExpired = counterEvidenceDeadline > 0 && now > counterEvidenceDeadline;

  function getPhaseState(key: number): "complete" | "active" | "pending" {
    if (key === 1.5) {
      if (status >= 2) return "complete";
      if (status === 1 && counterEvidenceExpired) return "complete";
      if (status === 1) return "active";
      return "pending";
    }
    if (status > key) return "complete";
    if (status === key) return "active";
    return "pending";
  }

  function getTimestamp(key: number): string {
    if (key === 0) return formatTimestamp(createdAt);
    if (key === 1.5) return counterEvidenceDeadline > 0 ? formatTimestamp(counterEvidenceDeadline) : "--";
    return "";
  }

  // Calculate active phase progress
  const evidenceElapsed = now - createdAt;
  const votingStart = counterEvidenceDeadline > 0 ? counterEvidenceDeadline : createdAt + EVIDENCE_DURATION;
  const votingElapsed = now - votingStart;

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Timeline</h3>

      {/* Horizontal phase indicator */}
      <div className="flex items-center gap-0 mb-5 overflow-hidden rounded-lg">
        {PHASES.map((phase, i) => {
          const state = getPhaseState(phase.key);
          const segColor = state === "complete" ? PHASE_COLORS.complete : state === "active" ? PHASE_COLORS.active : PHASE_COLORS.pending;
          return (
            <motion.div
              key={phase.key}
              className="flex-1 h-2 relative"
              style={{ backgroundColor: `${segColor}40` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <motion.div
                className="h-full"
                style={{ backgroundColor: segColor }}
                initial={{ width: 0 }}
                animate={{ width: state === "pending" ? "0%" : state === "active" ? "50%" : "100%" }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Phase progress bars for active phases */}
      {status === 1 && !counterEvidenceExpired && counterEvidenceDeadline > 0 && (
        <div className="mb-5">
          <PhaseProgress
            label="Counter-Evidence Window"
            elapsed={evidenceElapsed}
            total={counterEvidenceDeadline - createdAt}
            color="#3B82F6"
          />
        </div>
      )}
      {status === 2 && (
        <div className="mb-5">
          <PhaseProgress
            label="Voting Period (3 days)"
            elapsed={votingElapsed}
            total={VOTING_DURATION}
            color="#A855F7"
          />
        </div>
      )}

      {/* Vertical timeline */}
      <div className="space-y-0">
        {PHASES.map((phase, i) => {
          const state = getPhaseState(phase.key);
          const ts = getTimestamp(phase.key);
          const Icon = phase.icon;
          const dotColor =
            state === "complete"
              ? "bg-emerald-400"
              : state === "active"
              ? "bg-yellow-400"
              : "bg-surface-3";
          const lineColor =
            state === "complete" ? "bg-emerald-400/30" : "bg-surface-3/50";

          return (
            <div key={phase.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <motion.div
                  className={`w-7 h-7 rounded-full ${dotColor === "bg-surface-3" ? "bg-surface-3" : ""} flex items-center justify-center shrink-0`}
                  style={state !== "pending" ? { backgroundColor: state === "complete" ? "rgba(88,176,89,0.15)" : "rgba(245,158,11,0.15)" } : {}}
                  animate={state === "active" ? { boxShadow: ["0 0 0 0 rgba(245,158,11,0)", "0 0 8px 2px rgba(245,158,11,0.3)", "0 0 0 0 rgba(245,158,11,0)"] } : {}}
                  transition={state === "active" ? { duration: 2, repeat: Infinity } : {}}
                >
                  <Icon
                    className="w-3 h-3"
                    style={{
                      color: state === "complete" ? "#58B059" : state === "active" ? "#F59E0B" : "#5E6673",
                    }}
                  />
                </motion.div>
                {i < PHASES.length - 1 && (
                  <div className={`w-px h-6 ${lineColor}`} />
                )}
              </div>
              <div className="-mt-0.5 pb-3">
                <p className={`text-xs font-medium ${state === "pending" ? "text-text-tertiary" : "text-text-primary"}`}>
                  {phase.label}
                  {state === "active" && (
                    <span className="ml-2 text-[9px] text-yellow-400 font-normal">Current Phase</span>
                  )}
                </p>
                {ts && (
                  <p className="text-[10px] text-text-tertiary mt-0.5">{ts}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
