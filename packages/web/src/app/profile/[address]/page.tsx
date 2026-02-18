"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatEther, isAddress } from "viem";
import { useAccount } from "wagmi";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useReputationScore, useStakeTier, useStakeInfo, useProviderListingCount } from "@/lib/hooks";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#848E9C",
  Gold: "#F0B90B",
  Platinum: "#00D672",
  None: "#5E6673",
};

const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];

const TIER_THRESHOLDS = [0, 250, 1000, 5000, 25000];

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;

  if (!isAddress(address)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4 max-w-md">
          <p className="text-lg font-semibold text-text-primary">Invalid address</p>
          <p className="text-sm text-text-tertiary">
            The address provided is not a valid Ethereum address.
          </p>
          <Link
            href="/marketplace"
            className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80 transition-colors"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const { address: connectedAddress } = useAccount();
  const isOwnProfile = connectedAddress?.toLowerCase() === address.toLowerCase();
  const addr = address as `0x${string}`;
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  const { data: reputationScore, isLoading: repLoading } = useReputationScore(addr);
  const { data: stakeTier, isLoading: tierLoading } = useStakeTier(addr);
  const { data: stakeInfo, isLoading: stakeLoading } = useStakeInfo(addr);
  const { data: listingCount, isLoading: listingsLoading } = useProviderListingCount(addr);

  const score = reputationScore !== undefined ? Number(reputationScore) : undefined;
  const tierIndex = stakeTier !== undefined ? Number(stakeTier) : undefined;
  const tierName = tierIndex !== undefined ? TIER_NAMES[tierIndex] ?? "None" : undefined;
  const stakedAmount = stakeInfo ? stakeInfo.amount : undefined;
  const listings = listingCount !== undefined ? Number(listingCount) : undefined;

  // Compute reputation tier label based on score thresholds
  const scoreTierIndex = score !== undefined
    ? TIER_THRESHOLDS.reduce((acc, t, i) => (score >= t ? i : acc), 0)
    : 0;
  const scoreTierName = score !== undefined ? TIER_NAMES[scoreTierIndex] : undefined;

  // Progress bar: how far toward the next tier threshold
  const nextTierIndex = scoreTierIndex < TIER_THRESHOLDS.length - 1 ? scoreTierIndex + 1 : scoreTierIndex;
  const currentThreshold = TIER_THRESHOLDS[scoreTierIndex];
  const nextThreshold = TIER_THRESHOLDS[nextTierIndex];
  const progressPct = score !== undefined
    ? nextTierIndex === scoreTierIndex
      ? 100
      : Math.min(100, Math.round(((score - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
    : 0;

  const anyLoading = repLoading || tierLoading || stakeLoading || listingsLoading;

  const STATS = [
    { label: "Reputation", value: anyLoading ? "--" : String(score ?? 0), tier: scoreTierName ?? null },
    { label: "Staked LOB", value: anyLoading ? "--" : stakedAmount !== undefined ? formatEther(stakedAmount) : "0", tier: null },
    { label: "Stake Tier", value: anyLoading ? "--" : tierName ?? "None", tier: tierName !== "None" ? tierName ?? null : null },
    { label: "Dispute Win Rate", value: "--", tier: null },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <motion.div
            className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-surface-1"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease }}
          >
            <motion.div
              className="w-5 h-5 rounded-full bg-gradient-to-br from-lob-green/40 to-lob-green/10"
              animate={{
                boxShadow: [
                  "0 0 0 rgba(0,214,114,0)",
                  "0 0 12px rgba(0,214,114,0.15)",
                  "0 0 0 rgba(0,214,114,0)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </motion.div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-text-primary">Agent Profile</h1>
              {isOwnProfile && (
                <Link
                  href="/settings"
                  className="text-xs px-2.5 py-1 rounded border border-border/30 text-text-secondary hover:text-lob-green hover:border-lob-green/30 transition-colors"
                >
                  Edit Profile
                </Link>
              )}
            </div>
            <motion.p
              className="text-xs text-text-tertiary font-mono flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {address}
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lob-green hover:underline text-[10px]"
              >
                View on Explorer
              </a>
            </motion.p>
          </div>
        </div>
      </motion.div>

      {/* Profile stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="card p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.06, ease }}
            whileHover={{ y: -2, borderColor: "rgba(0,214,114,0.2)" }}
          >
            <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-xs text-text-tertiary uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-xl font-bold text-text-primary tabular-nums">{stat.value}</p>
              {stat.tier && (
                <motion.span
                  className="text-xs font-medium"
                  style={{ color: TIER_COLORS[stat.tier] }}
                  animate={{
                    textShadow: [
                      `0 0 0 ${TIER_COLORS[stat.tier]}00`,
                      `0 0 8px ${TIER_COLORS[stat.tier]}40`,
                      `0 0 0 ${TIER_COLORS[stat.tier]}00`,
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  {stat.tier}
                </motion.span>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Reputation progress bar */}
      <motion.div variants={fadeUp} className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-text-tertiary uppercase tracking-wider">Reputation Progress</p>
          <p className="text-xs text-text-secondary tabular-nums">
            {anyLoading
              ? "Loading..."
              : nextTierIndex === scoreTierIndex
                ? `${score?.toLocaleString() ?? 0} — Max tier reached`
                : `${score?.toLocaleString() ?? 0} / ${nextThreshold.toLocaleString()} to ${TIER_NAMES[nextTierIndex]}`}
          </p>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #00D672, #00FF88)" }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1.2, delay: 0.5, ease }}
          />
        </div>
      </motion.div>

      {/* Active listings */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Active Listings</h2>
          <span className="text-xs text-text-tertiary tabular-nums">{listingsLoading ? "--" : `${listings ?? 0} listing${listings === 1 ? "" : "s"}`}</span>
        </div>
        <div className="card">
          <div className="text-center py-12 px-4">
            <motion.div
              className="w-10 h-10 rounded border border-border/60 mx-auto mb-3 flex items-center justify-center"
              animate={{
                borderColor: ["rgba(30,36,49,0.6)", "rgba(0,214,114,0.15)", "rgba(30,36,49,0.6)"],
              }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <span className="text-text-disabled text-xs">{listings ?? 0}</span>
            </motion.div>
            <p className="text-sm text-text-secondary">No active listings for {shortAddress}</p>
            <p className="text-xs text-text-tertiary mt-1">
              Listings will appear once contracts are deployed.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
