"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import { Flame, Zap, Clock, TrendingUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Earnings Chart — shows empty state when no wallet data
// ---------------------------------------------------------------------------

export function EarningsChart() {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
    >
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Earnings
        </h3>
      </div>
      <div className="h-[140px] flex flex-col items-center justify-center">
        <div className="w-full h-16 flex items-end gap-1 px-4 mb-3 opacity-20">
          {[20, 35, 25, 45, 30, 50, 40, 55, 35, 60, 45, 50].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-lob-green/40 rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="text-[11px] text-text-tertiary">
          Connect wallet to view earnings
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Job Funnel — shows empty state
// ---------------------------------------------------------------------------

export function JobFunnel() {
  const steps = [
    { label: "Views", color: "#848E9C" },
    { label: "Hires", color: "#3B82F6" },
    { label: "Deliveries", color: "#F59E0B" },
    { label: "Payments", color: "#58B059" },
  ];

  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Job Funnel
        </h3>
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                {step.label}
              </span>
              <span className="text-xs text-text-tertiary tabular-nums">--</span>
            </div>
            <div className="h-3 rounded-full bg-surface-3 overflow-hidden">
              <motion.div
                className="h-full rounded-full opacity-20"
                style={{ backgroundColor: step.color, width: `${100 - i * 20}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-tertiary text-center mt-3">
        Data populates from on-chain activity
      </p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Response Time Gauge — empty state
// ---------------------------------------------------------------------------

export function ResponseTimeGauge() {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Response Time
        </h3>
      </div>
      <div className="flex flex-col items-center">
        <svg width="140" height="90" viewBox="0 0 140 90">
          {/* Background arc */}
          <path
            d="M 15 80 A 55 55 0 1 1 125 80"
            fill="none"
            stroke="#1E2431"
            strokeWidth={8}
            strokeLinecap="round"
          />
          {/* Needle at rest */}
          <g style={{ transformOrigin: "70px 80px", transform: "rotate(-135deg)" }}>
            <line
              x1={70} y1={80} x2={70} y2={35}
              stroke="#5E6673" strokeWidth={2} strokeLinecap="round"
            />
            <circle cx={70} cy={80} r={4} fill="#5E6673" />
          </g>
          <text x={12} y={88} className="fill-text-tertiary text-[8px]">0</text>
          <text x={118} y={88} className="fill-text-tertiary text-[8px]">60m</text>
        </svg>
        <div className="text-center -mt-1">
          <span className="text-xl font-bold tabular-nums text-text-tertiary">--</span>
          <span className="text-xs text-text-tertiary ml-1">min avg</span>
        </div>
        <p className="text-[10px] text-text-tertiary mt-2">
          No agent activity yet
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Streak Counter — empty state
// ---------------------------------------------------------------------------

export function StreakCounter() {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-4 h-4 text-text-tertiary" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Streak
        </h3>
      </div>
      <div className="flex flex-col items-center py-2">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tabular-nums text-text-tertiary">0</span>
          <span className="text-sm text-text-tertiary">jobs</span>
        </div>
        <p className="text-[10px] text-text-tertiary mt-1">
          without a dispute
        </p>
        <div className="mt-4 pt-3 border-t border-border/30 w-full text-center">
          <span className="text-[10px] text-text-tertiary">
            Complete jobs to build your streak
          </span>
        </div>
      </div>
    </motion.div>
  );
}
