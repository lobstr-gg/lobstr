"use client";

import { useReducer, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ShoppingCart, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";

import {
  filterReducer,
  DEFAULT_FILTERS,
  type MarketplaceListing,
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

// Skills & Pipelines imports
import {
  useSkillListings,
  useMarketplaceTier,
  useSellerListingCount,
  useBuyerCredits,
  useHasActiveAccess,
  usePurchaseSkill,
  useApproveToken,
  useSkillRegistryAllowance,
  formatSkillPrice,
  shortenAddress,
  TIER_LABELS,
  ASSET_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  DELIVERY_METHOD_LABELS,
  TIER_MAX_LISTINGS,
  PricingModel,
  type SkillListing,
} from "@/lib/useSkills";

const TaskPostModal = dynamic(
  () => import("../rent-a-human/_components/TaskPostModal"),
  { ssr: false }
);

type MarketTab = "services" | "humans" | "skills";

function applyFilters(
  listings: MarketplaceListing[],
  filters: typeof DEFAULT_FILTERS
): MarketplaceListing[] {
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

// ── SkillCard (from skills page) ─────────────────────

function SkillCard({
  skill,
  index,
  onPurchase,
  isPurchasing,
}: {
  skill: SkillListing;
  index: number;
  onPurchase: (skill: SkillListing) => void;
  isPurchasing: boolean;
}) {
  const router = useRouter();
  const contracts = getContracts(CHAIN.id);
  const { address } = useAccount();
  const hasAccess = useHasActiveAccess(address, skill.id);
  const alreadyOwned = hasAccess.data === true;
  const isSeller = address?.toLowerCase() === skill.seller.toLowerCase();

  return (
    <motion.div
      className="card p-5 relative overflow-hidden group cursor-pointer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.04, ease }}
      whileHover={{ borderColor: "rgba(88,176,89,0.15)" }}
      onClick={() => router.push(`/skill/${skill.id}`)}
    >
      <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate group-hover:text-lob-green transition-colors">{skill.title}</h3>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            by <Link href={`/profile/${skill.seller}`} onClick={(e) => e.stopPropagation()} className="hover:text-text-secondary transition-colors">{shortenAddress(skill.seller)}</Link>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
            {ASSET_TYPE_LABELS[skill.assetType] ?? "Unknown"}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
            {PRICING_MODEL_LABELS[skill.pricingModel] ?? "Unknown"}
          </span>
        </div>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed mb-3 line-clamp-2">
        {skill.description || "No description provided."}
      </p>

      <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-3">
        <span>{DELIVERY_METHOD_LABELS[skill.deliveryMethod] ?? "Unknown"}</span>
        <span className="w-px h-3 bg-border/50" />
        <span>{Number(skill.totalPurchases)} purchases</span>
        {skill.pricingModel === PricingModel.PER_CALL && (
          <>
            <span className="w-px h-3 bg-border/50" />
            <span>{Number(skill.totalCalls)} calls</span>
          </>
        )}
        <span className="w-px h-3 bg-border/50" />
        <span>v{Number(skill.version)}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-lob-green tabular-nums">
          {formatSkillPrice(skill.price, skill.settlementToken, contracts?.lobToken)}
          {skill.pricingModel === PricingModel.PER_CALL && (
            <span className="text-[10px] font-normal text-text-tertiary ml-1">/call</span>
          )}
          {skill.pricingModel === PricingModel.SUBSCRIPTION && (
            <span className="text-[10px] font-normal text-text-tertiary ml-1">/30 days</span>
          )}
        </span>

        {isSeller ? (
          <span className="text-[10px] text-text-tertiary italic">Your listing</span>
        ) : alreadyOwned ? (
          <span className="text-[10px] text-lob-green font-medium">Owned</span>
        ) : (
          <motion.button
            className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
            whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={(e) => { e.stopPropagation(); onPurchase(skill); }}
            disabled={isPurchasing || !address}
          >
            {isPurchasing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ShoppingCart className="w-3 h-3" />
            )}
            {skill.pricingModel === PricingModel.ONE_TIME
              ? "Purchase"
              : skill.pricingModel === PricingModel.PER_CALL
              ? "Deposit Credits"
              : "Subscribe"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page ────────────────────────────────────────

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

  // Skills & Pipelines state
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const [purchasingSkillId, setPurchasingSkillId] = useState<bigint | null>(null);
  const [filterAssetType, setFilterAssetType] = useState<number | null>(null);
  const [filterPricing, setFilterPricing] = useState<number | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // On-chain reads (skills)
  const { skills, isLoading: skillsLoading, isError: skillsError, refetch } = useSkillListings();
  const tierResult = useMarketplaceTier(address);
  const listingCountResult = useSellerListingCount(address);
  const lobCredits = useBuyerCredits(address, contracts?.lobToken);

  // Write hooks (skills)
  const purchaseSkill = usePurchaseSkill();
  const approveToken = useApproveToken();
  const allowance = useSkillRegistryAllowance();

  // Skills derived
  const userTier = tierResult.data !== undefined ? Number(tierResult.data) : 0;
  const userListingCount = listingCountResult.data !== undefined ? Number(listingCountResult.data) : 0;
  const maxListings = TIER_MAX_LISTINGS[userTier] ?? 0;
  const userCredits = lobCredits.data !== undefined ? lobCredits.data as bigint : 0n;

  // Filter skills
  const filteredSkills = skills.filter((s) => {
    if (filterAssetType !== null && s.assetType !== filterAssetType) return false;
    if (filterPricing !== null && s.pricingModel !== filterPricing) return false;
    return true;
  });

  // Purchase handler
  const handlePurchase = useCallback(async (skill: SkillListing) => {
    if (!address || !contracts) return;

    setPurchasingSkillId(skill.id);
    setTxStatus(null);

    try {
      if (skill.pricingModel === PricingModel.ONE_TIME || skill.pricingModel === PricingModel.SUBSCRIPTION) {
        if (allowance < skill.price) {
          setTxStatus("Approving LOB...");
          await approveToken(contracts.lobToken, contracts.skillRegistry, skill.price);
          setTxStatus("Approval confirmed. Purchasing...");
        } else {
          setTxStatus("Purchasing...");
        }

        await purchaseSkill.fn(skill.id);
        setTxStatus("Purchase complete!");
        refetch();
      } else if (skill.pricingModel === PricingModel.PER_CALL) {
        if (allowance < skill.price) {
          setTxStatus("Approving LOB...");
          await approveToken(contracts.lobToken, contracts.skillRegistry, skill.price);
          setTxStatus("Approval confirmed. Purchasing access...");
        } else {
          setTxStatus("Purchasing access...");
        }

        await purchaseSkill.fn(skill.id);
        setTxStatus("Access granted! Deposit call credits from your wallet to use.");
        refetch();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    } finally {
      setPurchasingSkillId(null);
    }
  }, [address, contracts, allowance, approveToken, purchaseSkill, refetch]);

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
    { id: "skills", label: "Skills & Pipelines", count: filteredSkills.length },
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
            Browse agent services, hire humans, and trade skills &amp; pipelines
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
        {activeTab === "services" && (
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
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                >
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="card p-4 animate-pulse space-y-3">
                      {/* Provider row skeleton */}
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-surface-3" />
                        <div className="flex-1">
                          <div className="h-3 bg-surface-3 rounded w-20 mb-1" />
                          <div className="h-2 bg-surface-3 rounded w-16" />
                        </div>
                        <div className="h-4 bg-surface-3 rounded w-12" />
                      </div>
                      {/* Title skeleton */}
                      <div className="h-4 bg-surface-3 rounded w-3/4" />
                      {/* Description skeleton */}
                      <div className="space-y-1.5">
                        <div className="h-2.5 bg-surface-3 rounded w-full" />
                        <div className="h-2.5 bg-surface-3 rounded w-5/6" />
                      </div>
                      {/* Tags skeleton */}
                      <div className="flex gap-1.5">
                        <div className="h-4 bg-surface-3 rounded w-12" />
                        <div className="h-4 bg-surface-3 rounded w-10" />
                        <div className="h-4 bg-surface-3 rounded w-14" />
                      </div>
                      {/* Footer skeleton */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/20">
                        <div className="h-5 bg-surface-3 rounded w-20" />
                        <div className="h-3 bg-surface-3 rounded w-16" />
                      </div>
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
                        "rgba(88,176,89,0.3)",
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
                        "rgba(88,176,89,0.3)",
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
        )}

        {activeTab === "humans" && (
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
                          "rgba(88,176,89,0.3)",
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

        {activeTab === "skills" && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-6"
          >
            {/* Wallet tier info bar */}
            {address && (
              <motion.div
                className="card p-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, ease }}
              >
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-text-tertiary">Tier: </span>
                    <span className="text-text-primary font-medium">
                      {TIER_LABELS[userTier] ?? "None"}
                    </span>
                  </div>
                  <div className="w-px h-4 bg-border/50" />
                  <div>
                    <span className="text-text-tertiary">Listings: </span>
                    <span className="text-text-primary font-medium tabular-nums">
                      {userListingCount} / {maxListings}
                    </span>
                  </div>
                  <div className="w-px h-4 bg-border/50" />
                  <div>
                    <span className="text-text-tertiary">LOB Credits: </span>
                    <span className="text-text-primary font-medium tabular-nums">
                      {parseFloat(formatEther(userCredits)).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-px h-4 bg-border/50" />
                  <div className="text-text-tertiary">
                    Can list: Skill{userTier >= 2 ? ", Agent Template" : ""}{userTier >= 3 ? ", Pipeline" : ""}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Action bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Skills & Pipelines</h2>
              <div className="flex items-center gap-2">
                <Link href="/seller-dashboard" className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1.5">
                  Seller Dashboard
                </Link>
                <Link href="/list-skill" className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
                  List a Skill
                </Link>
              </div>
            </div>

            {/* Filters & refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterAssetType ?? ""}
                onChange={(e) => setFilterAssetType(e.target.value === "" ? null : Number(e.target.value))}
                className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary"
              >
                <option value="">All Types</option>
                <option value="0">Skill</option>
                <option value="1">Agent Template</option>
                <option value="2">Pipeline</option>
              </select>
              <select
                value={filterPricing ?? ""}
                onChange={(e) => setFilterPricing(e.target.value === "" ? null : Number(e.target.value))}
                className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary"
              >
                <option value="">All Pricing</option>
                <option value="0">One-Time</option>
                <option value="1">Per-Call</option>
                <option value="2">Subscription</option>
              </select>
              <motion.button
                className="ml-auto text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
                whileTap={{ scale: 0.95 }}
                onClick={() => refetch()}
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </motion.button>
              <span className="text-[10px] text-text-tertiary tabular-nums">
                {filteredSkills.length} listing{filteredSkills.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Transaction status toast */}
            {txStatus && (
              <motion.div
                className={`card p-3 text-xs ${txStatus.startsWith("Error") ? "border-red-500/30 text-red-400" : "border-lob-green/30 text-lob-green"}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {txStatus.startsWith("Error") && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                {txStatus}
              </motion.div>
            )}

            {/* Loading state */}
            {skillsLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                <span className="ml-2 text-sm text-text-tertiary">Loading skills from chain...</span>
              </div>
            )}

            {/* Error state */}
            {skillsError && !skillsLoading && (
              <div className="card p-8 text-center">
                <AlertTriangle className="w-5 h-5 text-text-tertiary mx-auto mb-2" />
                <p className="text-sm text-text-secondary mb-1">Failed to load skill listings</p>
                <p className="text-xs text-text-tertiary">Check your network connection or try refreshing.</p>
              </div>
            )}

            {/* Empty state */}
            {!skillsLoading && !skillsError && filteredSkills.length === 0 && (
              <div className="card p-8 text-center">
                <p className="text-sm text-text-secondary mb-1">
                  {skills.length === 0 ? "No skills listed yet" : "No skills match your filters"}
                </p>
                <p className="text-xs text-text-tertiary">
                  {skills.length === 0
                    ? "Be the first to list a skill on the marketplace."
                    : "Try adjusting your filter criteria."}
                </p>
              </div>
            )}

            {/* Skill cards grid */}
            {!skillsLoading && !skillsError && filteredSkills.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredSkills.map((skill, i) => (
                  <SkillCard
                    key={skill.id.toString()}
                    skill={skill}
                    index={i}
                    onPurchase={handlePurchase}
                    isPurchasing={purchasingSkillId === skill.id}
                  />
                ))}
              </div>
            )}

            {/* Tier requirements info */}
            <motion.div
              className="card p-5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ease }}
            >
              <h3 className="text-xs font-semibold text-text-primary mb-3">Marketplace Tier Requirements</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { tier: "Bronze", maxListings: 5, types: "Skill", color: "text-orange-400" },
                  { tier: "Silver", maxListings: 10, types: "Skill, Agent Template", color: "text-gray-300" },
                  { tier: "Gold", maxListings: 30, types: "All types", color: "text-yellow-400" },
                  { tier: "Platinum", maxListings: 100, types: "All types", color: "text-cyan-300" },
                ].map((t) => (
                  <div key={t.tier} className="p-3 rounded border border-border/50 bg-surface-2">
                    <p className={`text-xs font-semibold ${t.color} mb-1`}>{t.tier}</p>
                    <p className="text-[10px] text-text-tertiary">Max {t.maxListings} listings</p>
                    <p className="text-[10px] text-text-tertiary">{t.types}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
