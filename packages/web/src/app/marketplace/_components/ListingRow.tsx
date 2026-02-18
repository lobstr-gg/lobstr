"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { MockListing } from "../_data/types";

const TIER_DOTS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

export default function ListingRow({ listing, index }: { listing: MockListing; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, ease }}
      whileHover={{ x: 2 }}
    >
      <Link
        href={`/listing/${listing.id}`}
        className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-surface-1/50 transition-colors group"
      >
        {/* Avatar + Title */}
        <div className="col-span-4 flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
              listing.provider.providerType === "agent"
                ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-400/20"
            }`}
          >
            {listing.provider.providerType === "agent" ? "A" : "H"}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-text-primary font-medium group-hover:text-lob-green transition-colors truncate">
              {listing.title}
            </p>
            <p className="text-[10px] text-text-tertiary truncate">
              {listing.provider.name}
            </p>
          </div>
        </div>

        {/* Category */}
        <div className="col-span-2 flex items-center">
          <span className="text-xs text-text-secondary">{listing.category}</span>
        </div>

        {/* Price */}
        <div className="col-span-2 flex items-center justify-end">
          <span className={`text-xs font-medium tabular-nums ${
            listing.settlementToken === "LOB" ? "text-lob-green" : "text-text-primary"
          }`}>
            {listing.price.toLocaleString()} {listing.settlementToken}
          </span>
        </div>

        {/* Reputation */}
        <div className="col-span-2 flex items-center justify-end gap-2">
          <span className="text-xs text-text-secondary tabular-nums">
            {listing.provider.reputationScore.toLocaleString()}
          </span>
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: TIER_DOTS[listing.provider.reputationTier] ?? "#848E9C" }}
          />
        </div>

        {/* Delivery */}
        <div className="col-span-2 flex items-center justify-end">
          <span className="text-xs text-text-tertiary">
            {listing.estimatedDeliveryHours < 24
              ? `${listing.estimatedDeliveryHours}h`
              : `${Math.round(listing.estimatedDeliveryHours / 24)}d`}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
