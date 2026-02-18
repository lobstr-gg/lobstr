"use client";

import { motion } from "framer-motion";
import type { SortMode } from "@/lib/forum-types";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
];

export default function SortControls({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  return (
    <div className="flex gap-1">
      {SORT_OPTIONS.map((opt) => (
        <motion.button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors relative overflow-hidden ${
            value === opt.value
              ? "text-lob-green border border-lob-green/30"
              : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary"
          }`}
          whileTap={{ scale: 0.95 }}
        >
          {value === opt.value && (
            <motion.div
              layoutId="sort-active"
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
