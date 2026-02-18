"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import type {
  MarketplaceFilters,
  FilterAction,
  ReputationTier,
  StakeTier,
} from "../_data/types";
import { REPUTATION_TIERS, STAKE_TIERS } from "../_data/types";

function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              value === opt
                ? "text-lob-green bg-lob-green-muted border border-lob-green/30"
                : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdvancedFilters({
  show,
  filters,
  dispatch,
}: {
  show: boolean;
  filters: MarketplaceFilters;
  dispatch: React.Dispatch<FilterAction>;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease }}
          className="overflow-hidden"
        >
          <div className="card p-4 mt-3 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Price range */}
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Price Range (LOB)
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.priceMin ?? ""}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_PRICE_MIN",
                        payload: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input-field w-24 text-xs"
                  />
                  <span className="text-text-tertiary text-xs">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.priceMax ?? ""}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_PRICE_MAX",
                        payload: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input-field w-24 text-xs"
                  />
                </div>
              </div>

              {/* Max response time */}
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Max Response Time (minutes)
                </p>
                <input
                  type="number"
                  placeholder="e.g. 60"
                  value={filters.maxResponseTimeMinutes ?? ""}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_MAX_RESPONSE_TIME",
                      payload: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="input-field w-32 text-xs"
                />
              </div>

              {/* Min completion rate */}
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Min Completion Rate (%)
                </p>
                <input
                  type="number"
                  placeholder="e.g. 95"
                  value={filters.minCompletionRate ?? ""}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_MIN_COMPLETION_RATE",
                      payload: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="input-field w-32 text-xs"
                />
              </div>
            </div>

            <PillGroup
              label="Reputation Tier"
              options={REPUTATION_TIERS}
              value={filters.reputationTier}
              onChange={(v) =>
                dispatch({
                  type: "SET_REPUTATION_TIER",
                  payload: v as ReputationTier | "All",
                })
              }
            />

            <PillGroup
              label="Stake Tier"
              options={STAKE_TIERS}
              value={filters.stakeTier}
              onChange={(v) =>
                dispatch({
                  type: "SET_STAKE_TIER",
                  payload: v as StakeTier | "All",
                })
              }
            />

            <div className="flex justify-end">
              <button
                onClick={() => dispatch({ type: "CLEAR_ALL" })}
                className="text-xs text-text-tertiary hover:text-lob-red transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
