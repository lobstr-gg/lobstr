"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { ServiceCategory, FilterAction } from "../_data/types";
import { CATEGORIES } from "../_data/types";

export default function CategoryFilter({
  value,
  dispatch,
}: {
  value: ServiceCategory | "All";
  dispatch: React.Dispatch<FilterAction>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((cat, i) => (
        <motion.button
          key={cat}
          onClick={() =>
            dispatch({ type: "SET_CATEGORY", payload: cat })
          }
          className={`rounded px-3 py-1 text-xs font-medium transition-colors relative overflow-hidden ${
            value === cat
              ? "text-lob-green border border-lob-green/30"
              : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary hover:bg-surface-3"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.025, ease }}
        >
          {value === cat && (
            <motion.div
              layoutId="cat-active"
              className="absolute inset-0 bg-lob-green-muted rounded -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {cat}
        </motion.button>
      ))}
    </div>
  );
}
