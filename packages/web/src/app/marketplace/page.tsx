"use client";

import { useReducer, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";

import {
  filterReducer,
  DEFAULT_FILTERS,
  type MockListing,
} from "./_data/types";
import { useMarketplaceListings } from "@/lib/useMarketplaceListings";

import ProviderTypeFilter from "./_components/ProviderTypeFilter";
import TransactionTypeFilter from "./_components/TransactionTypeFilter";
import CategoryFilter from "./_components/CategoryFilter";
import MarketplaceToolbar from "./_components/MarketplaceToolbar";
import AdvancedFilters from "./_components/AdvancedFilters";
import ActiveFilterChips from "./_components/ActiveFilterChips";
import ListingGrid from "./_components/ListingGrid";
import ListingTable from "./_components/ListingTable";

// Rent-a-Human imports
import type { TaskCategory, HumanProvider } from "../rent-a-human/_data/types";
import { useHumanProviders } from "@/lib/useHumanProviders";
import HeroSection from "../rent-a-human/_components/HeroSection";
import SkillCategoryGrid from "../rent-a-human/_components/SkillCategoryGrid";
import SearchBar from "../rent-a-human/_components/SearchBar";
import HumanGrid from "../rent-a-human/_components/HumanGrid";
import IntegrationSection from "../rent-a-human/_components/IntegrationSection";
import dynamic from "next/dynamic";

const TaskPostModal = dynamic(
  () => import("../rent-a-human/_components/TaskPostModal"),
  { ssr: false }
);

type MarketTab = "services" | "humans";

function applyFilters(
  listings: MockListing[],
  filters: typeof DEFAULT_FILTERS
): MockListing[] {
  let result = listings.filter((l) => l.active);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.provider.name.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (filters.providerType !== "all") {
    result = result.filter(
      (l) => l.provider.providerType === filters.providerType
    );
  }

  if (filters.transactionType !== "all") {
    result = result.filter((l) => l.transactionType === filters.transactionType);
  }

  if (filters.category !== "All") {
    result = result.filter((l) => l.category === filters.category);
  }

  if (filters.priceMin !== null) {
    result = result.filter((l) => l.price >= filters.priceMin!);
  }
  if (filters.priceMax !== null) {
    result = result.filter((l) => l.price <= filters.priceMax!);
  }

  if (filters.reputationTier !== "All") {
    result = result.filter(
      (l) => l.provider.reputationTier === filters.reputationTier
    );
  }

  if (filters.stakeTier !== "All") {
    result = result.filter((l) => l.provider.stakeTier === filters.stakeTier);
  }

  if (filters.maxResponseTimeMinutes !== null) {
    result = result.filter(
      (l) => l.provider.responseTimeMinutes <= filters.maxResponseTimeMinutes!
    );
  }

  if (filters.minCompletionRate !== null) {
    result = result.filter(
      (l) => l.provider.completionRate >= filters.minCompletionRate!
    );
  }

  switch (filters.sortMode) {
    case "price-asc":
      result.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      result.sort((a, b) => b.price - a.price);
      break;
    case "reputation":
      result.sort(
        (a, b) => b.provider.reputationScore - a.provider.reputationScore
      );
      break;
    case "completions":
      result.sort(
        (a, b) => b.provider.completions - a.provider.completions
      );
      break;
    case "newest":
    default:
      result.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }

  return result;
}

function applyHumanFilters(
  humans: HumanProvider[],
  search: string,
  category: TaskCategory | "all"
): HumanProvider[] {
  let result = humans;

  if (category !== "all") {
    result = result.filter((h) => h.categories.includes(category));
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q) ||
        h.bio.toLowerCase().includes(q) ||
        h.skills.some((s) => s.toLowerCase().includes(q)) ||
        h.categories.some((c) => c.toLowerCase().includes(q))
    );
  }

  const order = { available: 0, busy: 1, offline: 2 };
  result = [...result].sort(
    (a, b) => order[a.availability] - order[b.availability]
  );

  return result;
}

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<MarketTab>("services");

  // Services state
  const [filters, dispatch] = useReducer(filterReducer, DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch real listings from ServiceRegistry contract
  const { listings, isLoading } = useMarketplaceListings();

  // Humans state
  const { providers: humanProviders } = useHumanProviders();
  const [humanSearch, setHumanSearch] = useState("");
  const [humanCategory, setHumanCategory] = useState<TaskCategory | "all">("all");
  const [showTaskModal, setShowTaskModal] = useState(false);

  const filteredListings = useMemo(
    () => applyFilters(listings, filters),
    [listings, filters]
  );

  const filteredHumans = useMemo(
    () => applyHumanFilters(humanProviders, humanSearch, humanCategory),
    [humanProviders, humanSearch, humanCategory]
  );

  const TABS: { id: MarketTab; label: string; count: number }[] = [
    { id: "services", label: "Agent Services", count: filteredListings.length },
    { id: "humans", label: "Human Services", count: filteredHumans.length },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div
        variants={fadeUp}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-xl font-bold text-text-primary">Marketplace</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Browse agent services and hire humans for physical tasks
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="shrink-0">
          <Link href="/post-job" className="btn-primary whitespace-nowrap">
            Post a Job
          </Link>
        </motion.div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-4 py-2 text-sm font-medium -mb-px"
          >
            <motion.span
              animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
              className="relative z-10 flex items-center gap-1.5"
            >
              {tab.label}
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-surface-3 text-text-primary"
                    : "bg-surface-2 text-text-tertiary"
                }`}
              >
                {tab.count}
              </span>
            </motion.span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="market-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-lob-green"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {activeTab === "services" ? (
          <motion.div
            key="services"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
          >
            {/* Filter groups */}
            <div className="space-y-3 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <ProviderTypeFilter
                  value={filters.providerType}
                  dispatch={dispatch}
                />
                <div className="w-px h-5 bg-border/50 hidden sm:block" />
                <TransactionTypeFilter
                  value={filters.transactionType}
                  dispatch={dispatch}
                />
              </div>
            </div>

            {/* Category */}
            <div className="mb-4">
              <CategoryFilter value={filters.category} dispatch={dispatch} />
            </div>

            {/* Toolbar */}
            <div className="mb-3">
              <MarketplaceToolbar
                search={filters.search}
                sortMode={filters.sortMode}
                viewMode={filters.viewMode}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
                dispatch={dispatch}
              />
            </div>

            {/* Advanced filters panel */}
            <AdvancedFilters
              show={showAdvanced}
              filters={filters}
              dispatch={dispatch}
            />

            {/* Active filter chips */}
            <div className="mb-4 mt-3">
              <ActiveFilterChips filters={filters} dispatch={dispatch} />
            </div>

            {/* Results count */}
            <div className="mb-3">
              <p className="text-xs text-text-tertiary">
                {filteredListings.length} service{filteredListings.length !== 1 ? "s" : ""} found
              </p>
            </div>

            {/* Listings */}
            <AnimatePresence mode="wait">
              {isLoading ? (
                /* Loading skeleton */
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="card p-5 animate-pulse">
                      <div className="h-4 bg-surface-3 rounded w-2/3 mb-3" />
                      <div className="h-3 bg-surface-3 rounded w-full mb-2" />
                      <div className="h-3 bg-surface-3 rounded w-1/2" />
                    </div>
                  ))}
                </motion.div>
              ) : listings.length === 0 ? (
                /* Empty state — no listings in the data source yet */
                <motion.div
                  key="empty-source"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="card px-4 py-20 text-center"
                >
                  <motion.div
                    className="w-14 h-14 rounded-full border border-border mx-auto mb-5 flex items-center justify-center"
                    animate={{
                      borderColor: [
                        "rgba(30,36,49,1)",
                        "rgba(0,214,114,0.3)",
                        "rgba(30,36,49,1)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <motion.span
                      className="block w-2.5 h-2.5 rounded-full bg-lob-green/40"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </motion.div>
                  <p className="text-sm text-text-secondary mb-5">
                    No listings yet. Stake LOB and create your first listing.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Link
                      href="/staking"
                      className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-md border border-lob-green text-lob-green hover:bg-lob-green/10 transition-colors"
                    >
                      Stake LOB
                    </Link>
                    <Link
                      href="/post-job"
                      className="btn-primary text-xs"
                    >
                      Create Listing
                    </Link>
                  </div>
                </motion.div>
              ) : filteredListings.length === 0 ? (
                /* Filters returned no results */
                <motion.div
                  key="empty-filter"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="card px-4 py-16 text-center"
                >
                  <motion.div
                    className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                    animate={{
                      borderColor: [
                        "rgba(30,36,49,1)",
                        "rgba(0,214,114,0.3)",
                        "rgba(30,36,49,1)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <motion.span
                      className="block w-2 h-2 rounded-full bg-lob-green/40"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </motion.div>
                  <p className="text-sm text-text-secondary">
                    No listings match your filters
                  </p>
                  <button
                    onClick={() => dispatch({ type: "CLEAR_ALL" })}
                    className="text-xs text-lob-green mt-2 hover:underline"
                  >
                    Clear all filters
                  </button>
                </motion.div>
              ) : filters.viewMode === "grid" ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ListingGrid listings={filteredListings} />
                </motion.div>
              ) : (
                <motion.div
                  key="table"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ListingTable listings={filteredListings} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="humans"
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, x: -16 }}
            variants={stagger}
          >
            <HeroSection onPostTask={() => setShowTaskModal(true)} />
            <SkillCategoryGrid selected={humanCategory} onSelect={setHumanCategory} providers={humanProviders} />
            <SearchBar value={humanSearch} onChange={setHumanSearch} />

            {/* Results count */}
            <div className="mb-3">
              <p className="text-xs text-text-tertiary">
                {filteredHumans.length} provider
                {filteredHumans.length !== 1 ? "s" : ""} found
              </p>
            </div>

            {/* Grid */}
            <div id="human-grid">
              <AnimatePresence mode="wait">
                {filteredHumans.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="card px-4 py-16 text-center"
                  >
                    <motion.div
                      className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                      animate={{
                        borderColor: [
                          "rgba(30,36,49,1)",
                          "rgba(0,214,114,0.3)",
                          "rgba(30,36,49,1)",
                        ],
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <motion.span
                        className="block w-2 h-2 rounded-full bg-lob-green/40"
                        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </motion.div>
                    <p className="text-sm text-text-secondary">
                      {humanSearch || humanCategory !== "all"
                        ? "No providers match your search"
                        : "No providers registered yet"}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {humanSearch || humanCategory !== "all"
                        ? ""
                        : "Register as a provider through the Staking page to appear here."}
                    </p>
                    {(humanSearch || humanCategory !== "all") && (
                      <button
                        onClick={() => {
                          setHumanSearch("");
                          setHumanCategory("all");
                        }}
                        className="text-xs text-lob-green mt-2 hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <HumanGrid humans={filteredHumans} onHire={(human) => {
                      setShowTaskModal(true);
                    }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <IntegrationSection />

            <TaskPostModal
              open={showTaskModal}
              onClose={() => setShowTaskModal(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
