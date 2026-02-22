"use client";

import { motion } from "framer-motion";
import { fadeUp, ease } from "@/lib/motion";
import { TASK_CATEGORIES, type TaskCategory, type HumanProvider } from "../_data/types";

export default function SkillCategoryGrid({
  selected,
  onSelect,
  providers = [],
}: {
  selected: TaskCategory | "all";
  onSelect: (cat: TaskCategory | "all") => void;
  providers?: HumanProvider[];
}) {
  function countForCategory(cat: TaskCategory): number {
    return providers.filter(
      (h) => h.availability !== "offline" && h.categories.includes(cat)
    ).length;
  }

  return (
    <motion.div variants={fadeUp} className="mb-6">
      <div className="flex flex-wrap gap-2">
        <motion.button
          className={`card px-3 py-2 text-xs font-medium transition-colors ${
            selected === "all"
              ? "border-lob-green/40 text-lob-green bg-lob-green-muted"
              : "text-text-secondary hover:text-text-primary hover:border-border"
          }`}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.2, ease }}
          onClick={() => onSelect("all")}
        >
          All Categories
        </motion.button>
        {TASK_CATEGORIES.map(({ label, icon }) => {
          const count = countForCategory(label);
          const isActive = selected === label;
          return (
            <motion.button
              key={label}
              className={`card px-3 py-2 text-xs transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "border-lob-green/40 text-lob-green bg-lob-green-muted"
                  : "text-text-secondary hover:text-text-primary hover:border-border"
              }`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease }}
              onClick={() => onSelect(label)}
            >
              <span>{icon}</span>
              <span className="font-medium">{label}</span>
              <span className="text-text-tertiary">({count})</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
