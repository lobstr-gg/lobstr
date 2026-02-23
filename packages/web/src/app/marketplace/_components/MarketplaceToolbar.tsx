"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { SortMode, ViewMode, FilterAction } from "../_data/types";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "reputation", label: "Reputation" },
  { value: "completions", label: "Most Completions" },
];

export default function MarketplaceToolbar({
  search,
  sortMode,
  viewMode,
  showAdvanced,
  onToggleAdvanced,
  dispatch,
}: {
  search: string;
  sortMode: SortMode;
  viewMode: ViewMode;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  dispatch: React.Dispatch<FilterAction>;
}) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Search */}
      <div className="relative flex-1 w-full">
        <motion.div
          className="absolute inset-0 rounded border pointer-events-none"
          animate={{
            borderColor: searchFocused ? "rgba(88,176,89,0.4)" : "transparent",
            boxShadow: searchFocused
              ? "0 0 20px rgba(88,176,89,0.08)"
              : "0 0 0px transparent",
          }}
          transition={{ duration: 0.3 }}
        />
        <input
          type="text"
          placeholder="Search services, providers, tags..."
          value={search}
          onChange={(e) =>
            dispatch({ type: "SET_SEARCH", payload: e.target.value })
          }
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="input-field w-full"
        />
      </div>

      <div className="flex gap-2 items-center">
        {/* Sort */}
        <select
          value={sortMode}
          onChange={(e) =>
            dispatch({
              type: "SET_SORT",
              payload: e.target.value as SortMode,
            })
          }
          className="bg-surface-2 border border-border rounded px-3 py-1.5 text-xs text-text-secondary focus:border-lob-green/40 focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex gap-0.5 bg-surface-2 rounded p-0.5 border border-border/50">
          <motion.button
            onClick={() => dispatch({ type: "SET_VIEW", payload: "grid" })}
            className={`rounded px-2 py-1 text-xs relative ${
              viewMode === "grid"
                ? "text-lob-green"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            whileTap={{ scale: 0.9 }}
          >
            {viewMode === "grid" && (
              <motion.div
                layoutId="view-active"
                className="absolute inset-0 bg-lob-green-muted rounded -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </motion.button>
          <motion.button
            onClick={() => dispatch({ type: "SET_VIEW", payload: "table" })}
            className={`rounded px-2 py-1 text-xs relative ${
              viewMode === "table"
                ? "text-lob-green"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            whileTap={{ scale: 0.9 }}
          >
            {viewMode === "table" && (
              <motion.div
                layoutId="view-active"
                className="absolute inset-0 bg-lob-green-muted rounded -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="14" height="3" rx="1" />
              <rect x="1" y="6" width="14" height="3" rx="1" />
              <rect x="1" y="11" width="14" height="3" rx="1" />
            </svg>
          </motion.button>
        </div>

        {/* Advanced filters toggle */}
        <motion.button
          onClick={onToggleAdvanced}
          className={`rounded px-3 py-1.5 text-xs font-medium border transition-colors ${
            showAdvanced
              ? "text-lob-green border-lob-green/30 bg-lob-green-muted"
              : "text-text-secondary border-border hover:text-text-primary hover:bg-surface-2"
          }`}
          whileTap={{ scale: 0.95 }}
        >
          Filters
        </motion.button>
      </div>
    </div>
  );
}
