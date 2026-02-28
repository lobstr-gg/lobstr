"use client";

import { motion } from "framer-motion";
import { Wallet, Lock, Bot, Banknote } from "lucide-react";

type FlowStatus = "pending" | "locked" | "delivered" | "released";

interface EscrowFlowAnimationProps {
  status?: FlowStatus;
  amount?: string;
  token?: string;
  compact?: boolean;
}

const STATUS_INDEX: Record<FlowStatus, number> = {
  pending: 0,
  locked: 1,
  delivered: 2,
  released: 3,
};

const STEPS = [
  { icon: Wallet, label: "Wallet", desc: "Funds ready" },
  { icon: Lock, label: "Escrow", desc: "Locked" },
  { icon: Bot, label: "Delivery", desc: "Work submitted" },
  { icon: Banknote, label: "Released", desc: "Payment sent" },
];

export default function EscrowFlowAnimation({
  status = "pending",
  amount,
  token = "LOB",
  compact = false,
}: EscrowFlowAnimationProps) {
  const activeIdx = STATUS_INDEX[status];

  return (
    <div className={compact ? "" : "card p-5"}>
      {!compact && (
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Escrow Flow
          </h3>
          {amount && (
            <span className="text-xs font-bold text-lob-green tabular-nums">
              {amount} {token}
            </span>
          )}
        </div>
      )}

      {/* Flow SVG */}
      <div className="relative overflow-visible">
        <svg
          viewBox="0 0 600 46"
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Connection paths */}
          {[0, 1, 2].map((i) => {
            const x1 = 75 + i * 175;
            const x2 = 75 + (i + 1) * 175;
            const isActive = i < activeIdx;
            const isCurrent = i === activeIdx - 1;

            return (
              <g key={`connector-${i}`}>
                {/* Background path */}
                <line
                  x1={x1 + 20}
                  y1={30}
                  x2={x2 - 20}
                  y2={30}
                  stroke="#1E2431"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />

                {/* Active path */}
                <motion.line
                  x1={x1 + 20}
                  y1={30}
                  x2={x2 - 20}
                  y2={30}
                  stroke={isActive ? "#58B059" : "transparent"}
                  strokeWidth={2}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: isActive ? 1 : 0 }}
                  transition={{ duration: 0.8, delay: i * 0.3, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Traveling particle */}
                {isActive && (
                  <motion.circle
                    r={3}
                    fill="#58B059"
                    initial={{ cx: x1 + 20, cy: 30, opacity: 0 }}
                    animate={{
                      cx: [x1 + 20, x2 - 20],
                      cy: 30,
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      delay: i * 0.3 + 1,
                      repeat: Infinity,
                      repeatDelay: 3,
                    }}
                  >
                    <animate
                      attributeName="r"
                      values="2;4;2"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </motion.circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Step nodes overlaid */}
        <div className="absolute inset-0 flex items-start justify-between px-2">
          {STEPS.map((step, i) => {
            const isCompleted = i < activeIdx;
            const isCurrent = i === activeIdx;
            const Icon = step.icon;

            return (
              <motion.div
                key={step.label}
                className="flex flex-col items-center"
                style={{ width: "22%" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
              >
                {/* Circle node */}
                <motion.div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 relative ${
                    isCurrent
                      ? "border-lob-green bg-lob-green/10"
                      : isCompleted
                      ? "border-lob-green/40 bg-lob-green/5"
                      : "border-border bg-surface-2"
                  }`}
                  animate={
                    isCurrent
                      ? {
                          boxShadow: [
                            "0 0 0 0 rgba(88,176,89,0)",
                            "0 0 0 8px rgba(88,176,89,0.12)",
                            "0 0 0 0 rgba(88,176,89,0)",
                          ],
                        }
                      : {}
                  }
                  transition={isCurrent ? { duration: 2, repeat: Infinity } : {}}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isCurrent
                        ? "text-lob-green"
                        : isCompleted
                        ? "text-lob-green/60"
                        : "text-text-tertiary"
                    }`}
                  />

                  {/* Checkmark for completed */}
                  {isCompleted && (
                    <motion.div
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-lob-green flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.2 }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path
                          d="M1.5 4L3 5.5L6.5 2"
                          stroke="black"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.div>
                  )}
                </motion.div>

                {/* Labels */}
                <span
                  className={`text-[10px] font-medium mt-1.5 ${
                    isCurrent
                      ? "text-lob-green"
                      : isCompleted
                      ? "text-text-secondary"
                      : "text-text-tertiary"
                  }`}
                >
                  {step.label}
                </span>
                <span className="text-[8px] text-text-tertiary">{step.desc}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
