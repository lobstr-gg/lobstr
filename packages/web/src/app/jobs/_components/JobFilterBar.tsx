"use client";

import { motion } from "framer-motion";
import type { JobRole } from "../_data/types";

type RoleFilter = "all" | JobRole;
export type SortMode = "newest" | "budget" | "deadline";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (v: RoleFilter) => void;
  sortMode: SortMode;
  onSortModeChange: (v: SortMode) => void;
}

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buyer", label: "As Buyer" },
  { value: "seller", label: "As Seller" },
];

export default function JobFilterBar({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  sortMode,
  onSortModeChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search jobs..."
        className="input-field max-w-xs text-xs"
      />

      {/* Role toggle pills */}
      <div className="flex rounded-md border border-border overflow-hidden">
        {ROLE_OPTIONS.map((opt) => (
          <motion.button
            key={opt.value}
            onClick={() => onRoleFilterChange(opt.value)}
            className={`relative px-3 py-1.5 text-xs font-medium transition-colors ${
              roleFilter === opt.value
                ? "text-lob-green"
                : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
            } ${opt.value !== "all" ? "border-l border-border" : ""}`}
            whileTap={{ scale: 0.95 }}
          >
            {roleFilter === opt.value && (
              <motion.div
                layoutId="role-toggle"
                className="absolute inset-0 bg-lob-green-muted"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Sort */}
      <select
        value={sortMode}
        onChange={(e) => onSortModeChange(e.target.value as SortMode)}
        className="input-field w-auto text-xs"
      >
        <option value="newest">Newest</option>
        <option value="budget">Budget</option>
        <option value="deadline">Deadline</option>
      </select>
    </div>
  );
}
