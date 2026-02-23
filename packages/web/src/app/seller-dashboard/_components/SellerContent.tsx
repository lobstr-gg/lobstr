"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { formatEther } from "viem";
import Link from "next/link";
import { Loader2, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import {
  ASSET_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  TIER_LABELS,
  TIER_MAX_LISTINGS,
  formatSkillPrice,
  shortenAddress,
} from "@/lib/useSkills";
import { useMarketplaceTier, useSellerListingCount, useClaimSkillEarnings, useDeactivateSkill } from "@/lib/hooks";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  fetchSkillsForSeller,
  fetchSkillCreditEvents,
  fetchSkillUsage,
  type IndexerSkill,
  type IndexerSkillCreditEvent,
  type IndexerSkillUsageEvent,
} from "@/lib/indexer";

// ── Animation variants ─────────────────────────────────────

const fadeUpVariant = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease },
  }),
};

// ── Tab types ───────────────────────────────────────────────

type SellerTab = "listings" | "earnings" | "usage";

const TABS: { id: SellerTab; label: string }[] = [
  { id: "listings", label: "My Listings" },
  { id: "earnings", label: "Earnings" },
  { id: "usage", label: "Usage" },
];

// ── Listings Tab ────────────────────────────────────────────

function ListingsTab({ address }: { address: `0x${string}` }) {
  const contracts = getContracts(CHAIN.id);
  const tierResult = useMarketplaceTier(address);
  const listingCountResult = useSellerListingCount(address);
  const deactivateSkill = useDeactivateSkill();

  const userTier = tierResult.data !== undefined ? Number(tierResult.data) : 0;
  const userListingCount = listingCountResult.data !== undefined ? Number(listingCountResult.data) : 0;
  const maxListings = TIER_MAX_LISTINGS[userTier] ?? 0;

  const [skills, setSkills] = useState<IndexerSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchSkillsForSeller(address);
      setSkills(data);
    } catch (err) {
      console.error("Failed to fetch seller skills:", err);
      setError("Failed to load your listings. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleDeactivate = (skillId: string) => {
    setDeactivatingId(skillId);
    try {
      deactivateSkill(BigInt(skillId));
    } catch (err) {
      console.error("Deactivation failed:", err);
    } finally {
      setTimeout(() => setDeactivatingId(null), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.3, ease }}
      className="space-y-4"
    >
      {/* Tier info bar */}
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
          <div className="ml-auto">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link href="/list-skill" className="btn-primary text-xs px-3 py-1.5">
                List a New Skill
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Refresh button */}
      <div className="flex items-center justify-end">
        <motion.button
          className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
          whileTap={{ scale: 0.95 }}
          onClick={loadSkills}
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </motion.button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          <span className="ml-2 text-sm text-text-tertiary">Loading your listings...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-5 h-5 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-1">{error}</p>
          <button onClick={loadSkills} className="text-xs text-lob-green mt-2 hover:underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && skills.length === 0 && (
        <motion.div className="card px-4 py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div
            className="w-14 h-14 rounded-full border border-border mx-auto mb-5 flex items-center justify-center"
            animate={{ borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.3)", "rgba(30,36,49,1)"] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <motion.span className="block w-2.5 h-2.5 rounded-full bg-lob-green/40" animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
          </motion.div>
          <p className="text-sm text-text-secondary mb-2">You haven&apos;t listed any skills yet.</p>
          <p className="text-xs text-text-tertiary mb-5 max-w-xs mx-auto">
            List an API endpoint, code package, or agent template. Sell one-time, per-call, or via subscription.
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link href="/list-skill" className="btn-primary text-xs">List Your First Skill</Link>
          </motion.div>
          <Link href="/docs" className="block text-[10px] text-text-tertiary hover:text-text-secondary mt-3 transition-colors">
            Learn about pricing models
          </Link>
        </motion.div>
      )}

      {!isLoading && !error && skills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map((skill, i) => (
            <motion.div
              key={skill.id}
              className="card p-5 relative overflow-hidden group"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.04, ease }}
              whileHover={{ borderColor: "rgba(88,176,89,0.15)" }}
            >
              <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-text-primary truncate">{skill.title}</h3>
                  <p className="text-[10px] text-text-tertiary mt-0.5">ID: {skill.id}</p>
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
              <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-3">
                <span className="tabular-nums">{skill.totalPurchases} purchases</span>
                <span className="w-px h-3 bg-border/50" />
                <span className={`font-medium ${skill.active ? "text-lob-green" : "text-red-400"}`}>
                  {skill.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-lob-green tabular-nums">
                  {formatSkillPrice(BigInt(skill.price), skill.seller as `0x${string}`, contracts?.lobToken)}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/skill/${skill.id}`}
                    className="text-[10px] text-text-secondary hover:text-text-primary border border-border/50 rounded px-2 py-1 inline-flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View
                  </Link>
                  {skill.active && (
                    <motion.button
                      className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-1 transition-colors disabled:opacity-40"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleDeactivate(skill.id)}
                      disabled={deactivatingId === skill.id}
                    >
                      {deactivatingId === skill.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Deactivate"}
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Earnings Tab ────────────────────────────────────────────

interface TokenEarnings {
  token: string;
  total: bigint;
  events: IndexerSkillCreditEvent[];
}

function EarningsTab({ address }: { address: `0x${string}` }) {
  const contracts = getContracts(CHAIN.id);
  const claimEarnings = useClaimSkillEarnings();

  const [creditEvents, setCreditEvents] = useState<IndexerSkillCreditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingToken, setClaimingToken] = useState<string | null>(null);

  const loadEarnings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const events = await fetchSkillCreditEvents(address);
      setCreditEvents(events);
    } catch (err) {
      console.error("Failed to fetch credit events:", err);
      setError("Failed to load earnings data.");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => { loadEarnings(); }, [loadEarnings]);

  const sellerPaidEvents = creditEvents.filter((e) => e.eventType === "seller_paid");

  const earningsByToken: TokenEarnings[] = (() => {
    const map = new Map<string, { total: bigint; events: IndexerSkillCreditEvent[] }>();
    for (const event of sellerPaidEvents) {
      const existing = map.get(event.token);
      if (existing) {
        existing.total += BigInt(event.amount);
        existing.events.push(event);
      } else {
        map.set(event.token, { total: BigInt(event.amount), events: [event] });
      }
    }
    return Array.from(map.entries()).map(([token, data]) => ({ token, total: data.total, events: data.events }));
  })();

  const recentPayments = [...sellerPaidEvents].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  const handleClaim = (tokenAddress: string) => {
    setClaimingToken(tokenAddress);
    try { claimEarnings(tokenAddress as `0x${string}`); } catch (err) { console.error("Claim failed:", err); }
    finally { setTimeout(() => setClaimingToken(null), 2000); }
  };

  const formatTokenLabel = (token: string): string => {
    if (contracts?.lobToken && token.toLowerCase() === contracts.lobToken.toLowerCase()) return "LOB";
    return shortenAddress(token);
  };

  return (
    <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3, ease }} className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          <span className="ml-2 text-sm text-text-tertiary">Loading earnings data...</span>
        </div>
      )}
      {error && !isLoading && (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-5 h-5 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-1">{error}</p>
          <button onClick={loadEarnings} className="text-xs text-lob-green mt-2 hover:underline">Retry</button>
        </div>
      )}
      {!isLoading && !error && sellerPaidEvents.length === 0 && (
        <motion.div className="card px-4 py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="text-sm text-text-secondary mb-2">No earnings yet.</p>
          <p className="text-xs text-text-tertiary max-w-xs mx-auto">
            Earnings appear here when buyers purchase your skills or use your per-call APIs. Share your listing link to get started.
          </p>
        </motion.div>
      )}
      {!isLoading && !error && earningsByToken.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {earningsByToken.map((earning) => (
              <motion.div key={earning.token} className="card p-5 relative overflow-hidden" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, ease }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Total Earned ({formatTokenLabel(earning.token)})</p>
                    <p className="text-lg font-bold text-lob-green tabular-nums">{parseFloat(formatEther(earning.total)).toLocaleString()}</p>
                  </div>
                  <motion.button
                    className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleClaim(earning.token)}
                    disabled={claimingToken === earning.token}
                  >
                    {claimingToken === earning.token ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Claim
                  </motion.button>
                </div>
                <p className="text-[10px] text-text-tertiary">{earning.events.length} payment{earning.events.length !== 1 ? "s" : ""} received</p>
              </motion.div>
            ))}
          </div>
          <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, ease }}>
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-xs font-semibold text-text-primary">Recent Payments</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-5 py-2.5 text-text-tertiary font-medium">Date</th>
                    <th className="text-right px-5 py-2.5 text-text-tertiary font-medium">Amount</th>
                    <th className="text-right px-5 py-2.5 text-text-tertiary font-medium">Token</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.slice(0, 20).map((event) => (
                    <tr key={event.id} className="border-b border-border/20 hover:bg-surface-2/50 transition-colors">
                      <td className="px-5 py-2.5 text-text-secondary tabular-nums">
                        {new Date(Number(event.timestamp) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-2.5 text-right text-lob-green font-medium tabular-nums">{parseFloat(formatEther(BigInt(event.amount))).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right text-text-secondary">{formatTokenLabel(event.token)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// ── Usage Tab ───────────────────────────────────────────────

interface SkillUsageData {
  skill: IndexerSkill;
  usageEvents: IndexerSkillUsageEvent[];
  totalCalls: bigint;
  totalCost: bigint;
}

function UsageTab({ address }: { address: `0x${string}` }) {
  const [usageData, setUsageData] = useState<SkillUsageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const skills = await fetchSkillsForSeller(address);
      const perCallSkills = skills.filter((s) => s.pricingModel === 1);
      if (perCallSkills.length === 0) { setUsageData([]); setIsLoading(false); return; }
      const results: SkillUsageData[] = await Promise.all(
        perCallSkills.map(async (skill) => {
          try {
            const events = await fetchSkillUsage(skill.id);
            const totalCalls = events.reduce((sum, e) => sum + BigInt(e.calls), 0n);
            const totalCost = events.reduce((sum, e) => sum + BigInt(e.cost), 0n);
            return { skill, usageEvents: events, totalCalls, totalCost };
          } catch { return { skill, usageEvents: [], totalCalls: 0n, totalCost: 0n }; }
        })
      );
      setUsageData(results);
    } catch (err) {
      console.error("Failed to fetch usage data:", err);
      setError("Failed to load usage data.");
    } finally { setIsLoading(false); }
  }, [address]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  return (
    <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3, ease }} className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          <span className="ml-2 text-sm text-text-tertiary">Loading usage data...</span>
        </div>
      )}
      {error && !isLoading && (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-5 h-5 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-1">{error}</p>
          <button onClick={loadUsage} className="text-xs text-lob-green mt-2 hover:underline">Retry</button>
        </div>
      )}
      {!isLoading && !error && usageData.length === 0 && (
        <motion.div className="card px-4 py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="text-sm text-text-secondary mb-2">No per-call usage data.</p>
          <p className="text-xs text-text-tertiary max-w-xs mx-auto">
            Usage tracking applies to skills with per-call pricing. List an API with per-call billing to see call analytics here.
          </p>
          <Link href="/list-skill" className="block text-xs text-lob-green hover:underline mt-4">
            List a per-call API
          </Link>
        </motion.div>
      )}
      {!isLoading && !error && usageData.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {usageData.map((data, i) => (
              <motion.div key={data.skill.id} className="card p-5 relative overflow-hidden" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04, ease }}>
                <h3 className="text-sm font-medium text-text-primary mb-3 truncate">{data.skill.title}</h3>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Total Calls</p>
                    <p className="text-text-primary font-semibold tabular-nums">{data.totalCalls.toString()}</p>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Total Revenue</p>
                    <p className="text-lob-green font-semibold tabular-nums">{parseFloat(formatEther(data.totalCost)).toLocaleString()}</p>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">Events</p>
                    <p className="text-text-primary font-semibold tabular-nums">{data.usageEvents.length}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {usageData.filter((d) => d.usageEvents.length > 0).map((data) => (
            <motion.div key={`table-${data.skill.id}`} className="card overflow-hidden" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, ease }}>
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-xs font-semibold text-text-primary">Usage Events: {data.skill.title}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-5 py-2.5 text-text-tertiary font-medium">Date</th>
                      <th className="text-right px-5 py-2.5 text-text-tertiary font-medium">Calls</th>
                      <th className="text-right px-5 py-2.5 text-text-tertiary font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usageEvents.slice(0, 15).map((event) => (
                      <tr key={event.id} className="border-b border-border/20 hover:bg-surface-2/50 transition-colors">
                        <td className="px-5 py-2.5 text-text-secondary tabular-nums">
                          {new Date(Number(event.timestamp) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-5 py-2.5 text-right text-text-primary font-medium tabular-nums">{event.calls}</td>
                        <td className="px-5 py-2.5 text-right text-lob-green font-medium tabular-nums">{parseFloat(formatEther(BigInt(event.cost))).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.usageEvents.length > 15 && (
                <div className="px-5 py-2.5 text-center">
                  <p className="text-[10px] text-text-tertiary">Showing 15 of {data.usageEvents.length} events</p>
                </div>
              )}
            </motion.div>
          ))}
        </>
      )}
    </motion.div>
  );
}

// ── Exported Content Component ──────────────────────────────

export default function SellerContent({ address }: { address: `0x${string}` }) {
  const [activeTab, setActiveTab] = useState<SellerTab>("listings");

  return (
    <div>
      {/* Tab bar */}
      <motion.div
        className="flex rounded-md border border-border overflow-hidden mb-6"
        variants={fadeUpVariant}
        custom={1}
      >
        {TABS.map((tab, i) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-lob-green"
                : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
            } ${i !== 0 ? "border-l border-border" : ""}`}
            whileTap={{ scale: 0.97 }}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="seller-tab"
                className="absolute inset-0 bg-lob-green-muted"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "listings" && <ListingsTab key="listings" address={address} />}
        {activeTab === "earnings" && <EarningsTab key="earnings" address={address} />}
        {activeTab === "usage" && <UsageTab key="usage" address={address} />}
      </AnimatePresence>
    </div>
  );
}
