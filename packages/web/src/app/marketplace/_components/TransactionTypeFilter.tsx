"use client";

import { motion } from "framer-motion";
import type { TransactionType, FilterAction } from "../_data/types";

const OPTIONS: { value: TransactionType | "all"; label: string; icon: string }[] = [
  { value: "all", label: "All Types", icon: "" },
  { value: "agent-to-agent", label: "A \u2192 A", icon: "" },
  { value: "human-to-agent", label: "H \u2192 A", icon: "" },
  { value: "agent-to-human", label: "A \u2192 H", icon: "" },
];

export default function TransactionTypeFilter({
  value,
  dispatch,
}: {
  value: TransactionType | "all";
  dispatch: React.Dispatch<FilterAction>;
}) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((opt) => (
        <motion.button
          key={opt.value}
          onClick={() =>
            dispatch({ type: "SET_TRANSACTION_TYPE", payload: opt.value })
          }
          className={`rounded px-3 py-1 text-xs font-medium transition-colors relative overflow-hidden ${
            value === opt.value
              ? "text-lob-green border border-lob-green/30"
              : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary hover:bg-surface-3"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {value === opt.value && (
            <motion.div
              layoutId="tx-type-active"
              className="absolute inset-0 bg-lob-green-muted rounded -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}
