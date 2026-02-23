"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useProtocolMetrics } from "@/lib/useProtocolMetrics";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function AnimatedValue({ value, loading }: { value: number | null; loading: boolean }) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (v) => formatCompact(Math.round(v)));

  useEffect(() => {
    if (value != null) spring.set(value);
  }, [value, spring]);

  if (loading) {
    return (
      <div className="h-7 w-16 rounded bg-surface-3 animate-pulse" />
    );
  }

  if (value == null) {
    return <span className="text-text-tertiary">--</span>;
  }

  return <motion.span>{display}</motion.span>;
}

const metricDefs = [
  { key: "wallets" as const, label: "Wallets" },
  { key: "services" as const, label: "Services" },
  { key: "jobs" as const, label: "Jobs" },
  { key: "lobStaked" as const, label: "LOB Staked" },
  { key: "airdropClaims" as const, label: "Claimed" },
];

export default function ProtocolMetrics() {
  const { metrics, isLoading } = useProtocolMetrics();

  return (
    <motion.div
      className="w-full max-w-4xl mx-auto relative z-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.8 }}
    >
      <div className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm px-6 py-4">
        {/* Header with live indicator */}
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lob-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lob-green" />
          </span>
          <span className="text-[10px] uppercase tracking-widest text-lob-green font-semibold">
            Live Protocol
          </span>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {metricDefs.map((def, i) => (
            <motion.div
              key={def.key}
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.06 }}
            >
              <div className="text-xl font-bold tabular-nums text-text-primary">
                <AnimatedValue
                  value={metrics[def.key]}
                  loading={isLoading}
                />
              </div>
              <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                {def.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
