"use client";

import { motion } from "framer-motion";

interface DisputeTimelineProps {
  status: number; // 0=Open, 1=EvidencePhase, 2=Voting, 3=Resolved
  createdAt: number; // unix seconds
  counterEvidenceDeadline: number; // unix seconds
}

const PHASES = [
  { label: "Opened", key: 0 },
  { label: "Evidence", key: 1 },
  { label: "Counter-Evidence Deadline", key: 1.5 },
  { label: "Voting", key: 2 },
  { label: "Resolved", key: 3 },
];

function formatTimestamp(unix: number): string {
  if (!unix) return "--";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DisputeTimeline({ status, createdAt, counterEvidenceDeadline }: DisputeTimelineProps) {
  const now = Math.floor(Date.now() / 1000);
  const counterEvidenceExpired = counterEvidenceDeadline > 0 && now > counterEvidenceDeadline;

  function getPhaseState(key: number): "complete" | "active" | "pending" {
    if (key === 1.5) {
      // Counter-evidence deadline phase
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

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Timeline</h3>
      <div className="space-y-0">
        {PHASES.map((phase, i) => {
          const state = getPhaseState(phase.key);
          const ts = getTimestamp(phase.key);
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
                  className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`}
                  animate={state === "active" ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] } : {}}
                  transition={state === "active" ? { duration: 2, repeat: Infinity } : {}}
                />
                {i < PHASES.length - 1 && (
                  <div className={`w-px h-8 ${lineColor}`} />
                )}
              </div>
              <div className="-mt-0.5 pb-4">
                <p className={`text-xs font-medium ${state === "pending" ? "text-text-tertiary" : "text-text-primary"}`}>
                  {phase.label}
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
