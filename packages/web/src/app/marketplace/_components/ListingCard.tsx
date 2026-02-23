"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import SpotlightCard from "@/components/SpotlightCard";
import type { MarketplaceListing } from "../_data/types";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

const TIER_GLOW: Record<string, string> = {
  Bronze: "tier-glow-bronze",
  Silver: "tier-glow-silver",
  Gold: "tier-glow-gold",
  Platinum: "tier-glow-platinum",
};

export default function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const tierColor = TIER_COLORS[listing.provider.reputationTier] ?? "#848E9C";
  const tierGlow = TIER_GLOW[listing.provider.reputationTier] ?? "";
  const isAgent = listing.provider.providerType === "agent";

  return (
    <SpotlightCard className={`card p-4 flex flex-col group ${tierGlow}`}>
    <motion.div
      className="flex flex-col flex-1"
      whileHover={{
        y: -4,
      }}
      transition={{ duration: 0.2, ease }}
    >
      {/* Background pattern — circuit for agents, warm gradient for humans */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${
          isAgent ? "circuit-pattern" : "warm-gradient"
        }`}
      />

      <Link href={`/listing/${listing.id}`} className="flex flex-col flex-1 relative z-10">
        {/* Provider row */}
        <div className="flex items-center gap-2 mb-3">
          <motion.div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
              isAgent
                ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-400/20"
            }`}
            whileHover={{ scale: 1.15, rotate: isAgent ? 360 : 0 }}
            transition={{ duration: 0.4 }}
          >
            {isAgent ? "A" : "H"}
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {listing.provider.name}
            </p>
            <p className="text-[10px] text-text-tertiary font-mono">
              {listing.provider.address}
            </p>
          </div>
          <motion.span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color: tierColor,
              backgroundColor: `${tierColor}15`,
              border: `1px solid ${tierColor}30`,
            }}
            whileHover={{ scale: 1.05 }}
          >
            {listing.provider.reputationTier}
          </motion.span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors mb-1.5 line-clamp-2">
          {listing.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
          {listing.description}
        </p>

        {/* Tags — animated on hover */}
        <div className="flex flex-wrap gap-1 mb-3">
          {listing.tags.slice(0, 3).map((tag, i) => (
            <motion.span
              key={tag}
              className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded group-hover:bg-surface-3 transition-colors"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {tag}
            </motion.span>
          ))}
        </div>

        {/* Reputation mini-bar (visible on hover) */}
        <div className="mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-text-tertiary">Reputation</span>
            <span className="text-[9px] text-text-tertiary tabular-nums">
              {listing.provider.reputationScore}
            </span>
          </div>
          <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: tierColor }}
              initial={{ width: 0 }}
              whileInView={{ width: `${Math.min(100, listing.provider.reputationScore / 100)}%` }}
              transition={{ duration: 0.6, ease }}
            />
          </div>
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div>
            <motion.span
              className={`text-sm font-bold tabular-nums ${
                listing.settlementToken === "LOB" ? "text-lob-green" : "text-text-primary"
              }`}
              whileHover={{ scale: 1.05 }}
            >
              {listing.price.toLocaleString()}
            </motion.span>
            <span className="text-[10px] text-text-tertiary ml-1">
              {listing.settlementToken}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
            <span>{listing.provider.completions} jobs</span>
            <span>{listing.provider.responseTime}</span>
          </div>
        </div>
      </Link>
    </motion.div>
    </SpotlightCard>
  );
}
