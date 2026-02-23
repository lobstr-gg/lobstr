"use client";

import { motion } from "framer-motion";
import { Briefcase, Bot, ShieldCheck, Banknote, AlertTriangle, CheckCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type JobStatus = "created" | "active" | "delivered" | "confirmed" | "disputed" | "resolved";

interface TimelineStep {
  key: JobStatus;
  label: string;
  icon: LucideIcon;
}

const MAIN_STEPS: TimelineStep[] = [
  { key: "created", label: "Created", icon: Briefcase },
  { key: "active", label: "Active", icon: Bot },
  { key: "delivered", label: "Delivered", icon: ShieldCheck },
  { key: "confirmed", label: "Confirmed", icon: Banknote },
];

const DISPUTE_STEPS: TimelineStep[] = [
  { key: "disputed", label: "Disputed", icon: AlertTriangle },
  { key: "resolved", label: "Resolved", icon: CheckCircle },
];

const STATUS_ORDER: Record<JobStatus, number> = {
  created: 0,
  active: 1,
  delivered: 2,
  confirmed: 3,
  disputed: 2.5,
  resolved: 3.5,
};

interface JobLifecycleTimelineProps {
  currentStatus: JobStatus;
  compact?: boolean;
}

function StepNode({
  step,
  isActive,
  isCompleted,
  isCurrent,
  delay,
}: {
  step: TimelineStep;
  isActive: boolean;
  isCompleted: boolean;
  isCurrent: boolean;
  delay: number;
}) {
  const Icon = step.icon;
  const isDispute = step.key === "disputed" || step.key === "resolved";

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5 relative"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      {/* Node circle */}
      <motion.div
        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all relative ${
          isCurrent
            ? isDispute
              ? "border-lob-red bg-lob-red/10"
              : "border-lob-green bg-lob-green/10"
            : isCompleted
            ? isDispute
              ? "border-lob-red/50 bg-lob-red/5"
              : "border-lob-green/50 bg-lob-green/5"
            : "border-border bg-surface-2"
        }`}
        animate={
          isCurrent
            ? {
                boxShadow: [
                  `0 0 0 0 ${isDispute ? "rgba(255,59,105,0)" : "rgba(88,176,89,0)"}`,
                  `0 0 0 6px ${isDispute ? "rgba(255,59,105,0.15)" : "rgba(88,176,89,0.15)"}`,
                  `0 0 0 0 ${isDispute ? "rgba(255,59,105,0)" : "rgba(88,176,89,0)"}`,
                ],
              }
            : {}
        }
        transition={isCurrent ? { duration: 2, repeat: Infinity } : {}}
      >
        <Icon
          className={`w-3.5 h-3.5 ${
            isCurrent
              ? isDispute
                ? "text-lob-red"
                : "text-lob-green"
              : isCompleted
              ? isDispute
                ? "text-lob-red/60"
                : "text-lob-green/60"
              : "text-text-tertiary"
          }`}
        />
      </motion.div>

      {/* Label */}
      <span
        className={`text-[9px] font-medium whitespace-nowrap ${
          isCurrent
            ? isDispute
              ? "text-lob-red"
              : "text-lob-green"
            : isCompleted
            ? "text-text-secondary"
            : "text-text-tertiary"
        }`}
      >
        {step.label}
      </span>
    </motion.div>
  );
}

function Connector({
  isCompleted,
  delay,
  isDispute,
}: {
  isCompleted: boolean;
  delay: number;
  isDispute?: boolean;
}) {
  return (
    <div className="flex-1 flex items-center px-1 -mt-4">
      <div className="w-full h-px bg-border relative overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 ${
            isDispute ? "bg-lob-red/50" : "bg-lob-green/50"
          }`}
          initial={{ width: "0%" }}
          animate={{ width: isCompleted ? "100%" : "0%" }}
          transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
        />
        {isCompleted && (
          <motion.div
            className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
              isDispute ? "bg-lob-red" : "bg-lob-green"
            } shadow-sm`}
            initial={{ left: "0%" }}
            animate={{ left: "100%" }}
            transition={{
              duration: 1.5,
              delay: delay + 0.5,
              repeat: Infinity,
              repeatDelay: 3,
              ease: "easeInOut",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function JobLifecycleTimeline({
  currentStatus,
  compact = false,
}: JobLifecycleTimelineProps) {
  const currentOrder = STATUS_ORDER[currentStatus];
  const isDisputePath = currentStatus === "disputed" || currentStatus === "resolved";

  const steps = isDisputePath
    ? [...MAIN_STEPS.slice(0, 3), ...DISPUTE_STEPS]
    : MAIN_STEPS;

  return (
    <div className={`${compact ? "" : "card p-4"}`}>
      {!compact && (
        <h3 className="text-xs font-semibold text-text-primary mb-4 uppercase tracking-wider">
          Job Lifecycle
        </h3>
      )}
      <div className="flex items-start">
        {steps.map((step, i) => {
          const stepOrder = STATUS_ORDER[step.key];
          const isCompleted = stepOrder < currentOrder;
          const isCurrent = step.key === currentStatus;
          const isActive = isCompleted || isCurrent;
          const isDisputeStep = step.key === "disputed" || step.key === "resolved";

          return (
            <div key={step.key} className="contents">
              <StepNode
                step={step}
                isActive={isActive}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                delay={0.1 + i * 0.1}
              />
              {i < steps.length - 1 && (
                <Connector
                  isCompleted={isCompleted}
                  delay={0.15 + i * 0.1}
                  isDispute={isDisputeStep || steps[i + 1]?.key === "disputed"}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
