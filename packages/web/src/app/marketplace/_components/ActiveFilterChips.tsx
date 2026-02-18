"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { MarketplaceFilters, FilterAction } from "../_data/types";
import { DEFAULT_FILTERS } from "../_data/types";

interface Chip {
  label: string;
  filterKey: keyof MarketplaceFilters;
}

function getActiveChips(filters: MarketplaceFilters): Chip[] {
  const chips: Chip[] = [];

  if (filters.providerType !== "all") {
    chips.push({
      label: `Provider: ${filters.providerType}`,
      filterKey: "providerType",
    });
  }
  if (filters.transactionType !== "all") {
    chips.push({
      label: `Type: ${filters.transactionType}`,
      filterKey: "transactionType",
    });
  }
  if (filters.category !== "All") {
    chips.push({ label: `Category: ${filters.category}`, filterKey: "category" });
  }
  if (filters.priceMin !== null) {
    chips.push({ label: `Min: ${filters.priceMin} LOB`, filterKey: "priceMin" });
  }
  if (filters.priceMax !== null) {
    chips.push({ label: `Max: ${filters.priceMax} LOB`, filterKey: "priceMax" });
  }
  if (filters.reputationTier !== "All") {
    chips.push({
      label: `Rep: ${filters.reputationTier}`,
      filterKey: "reputationTier",
    });
  }
  if (filters.stakeTier !== "All") {
    chips.push({ label: `Stake: ${filters.stakeTier}`, filterKey: "stakeTier" });
  }
  if (filters.maxResponseTimeMinutes !== null) {
    chips.push({
      label: `Response: <${filters.maxResponseTimeMinutes}m`,
      filterKey: "maxResponseTimeMinutes",
    });
  }
  if (filters.minCompletionRate !== null) {
    chips.push({
      label: `Completion: >${filters.minCompletionRate}%`,
      filterKey: "minCompletionRate",
    });
  }

  return chips;
}

export default function ActiveFilterChips({
  filters,
  dispatch,
}: {
  filters: MarketplaceFilters;
  dispatch: React.Dispatch<FilterAction>;
}) {
  const chips = getActiveChips(filters);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <AnimatePresence mode="popLayout">
        {chips.map((chip) => (
          <motion.button
            key={chip.filterKey}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() =>
              dispatch({ type: "REMOVE_FILTER", payload: chip.filterKey })
            }
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-lob-green-muted text-lob-green border border-lob-green/20 hover:border-lob-green/40 transition-colors"
          >
            {chip.label}
            <span className="text-lob-green/60 ml-0.5">&times;</span>
          </motion.button>
        ))}
        {chips.length > 1 && (
          <motion.button
            key="clear-all"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dispatch({ type: "CLEAR_ALL" })}
            className="text-[11px] text-text-tertiary hover:text-lob-red transition-colors ml-1"
          >
            Clear All
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
