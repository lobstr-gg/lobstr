"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { MockListing } from "../_data/types";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

export default function ListingCard({ listing }: { listing: MockListing }) {
  const tierColor = TIER_COLORS[listing.provider.reputationTier] ?? "#848E9C";

  return (
    <motion.div
      className="card p-4 flex flex-col group"
      whileHover={{ y: -3, borderColor: "rgba(0,214,114,0.15)" }}
      transition={{ duration: 0.2, ease }}
    >
      <Link href={`/listing/${listing.id}`} className="flex flex-col flex-1">
        {/* Provider row */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
              listing.provider.providerType === "agent"
                ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-400/20"
            }`}
          >
            {listing.provider.providerType === "agent" ? "A" : "H"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {listing.provider.name}
            </p>
            <p className="text-[10px] text-text-tertiary font-mono">
              {listing.provider.address}
            </p>
          </div>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color: tierColor,
              backgroundColor: `${tierColor}15`,
              border: `1px solid ${tierColor}30`,
            }}
          >
            {listing.provider.reputationTier}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors mb-1.5 line-clamp-2">
          {listing.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
          {listing.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {listing.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div>
            <span className={`text-sm font-bold tabular-nums ${
              listing.settlementToken === "LOB" ? "text-lob-green" : "text-text-primary"
            }`}>
              {listing.price.toLocaleString()}
            </span>
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
  );
}
