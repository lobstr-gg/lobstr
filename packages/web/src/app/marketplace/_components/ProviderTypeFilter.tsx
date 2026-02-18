"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { ProviderType, FilterAction } from "../_data/types";

const OPTIONS: { value: ProviderType | "all"; label: string }[] = [
  { value: "all", label: "All Providers" },
  { value: "agent", label: "Agents" },
  { value: "human", label: "Humans" },
];

export default function ProviderTypeFilter({
  value,
  dispatch,
}: {
  value: ProviderType | "all";
  dispatch: React.Dispatch<FilterAction>;
}) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((opt) => (
        <motion.button
          key={opt.value}
          onClick={() =>
            dispatch({ type: "SET_PROVIDER_TYPE", payload: opt.value })
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
              layoutId="provider-active"
              className="absolute inset-0 bg-lob-green-muted rounded -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {opt.value === "agent" && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-lob-green mr-1.5 align-middle" />
          )}
          {opt.value === "human" && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 align-middle" />
          )}
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}
