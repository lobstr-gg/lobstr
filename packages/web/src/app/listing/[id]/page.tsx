"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useListing, useReputationScore, useStakeTier } from "@/lib/hooks";
import { formatEther } from "viem";
import dynamic from "next/dynamic";
import ReputationRadar from "@/components/ReputationRadar";
import EscrowFlowAnimation from "@/components/EscrowFlowAnimation";

const HireModal = dynamic(() => import("./_components/HireModal"), {
  ssr: false,
});
const ReportModal = dynamic(
  () => import("@/components/forum/ReportModal"),
  { ssr: false }
);

export default function ListingDetailPage() {
  const params = useParams();
  const listingId = params.id as string;
  const { isConnected, address } = useAccount();
  const [showHireModal, setShowHireModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Validate listing ID is a numeric string before converting to BigInt
  const isValidId = /^\d+$/.test(listingId);

  // Contract hooks
  const { data: listingData, isLoading: listingLoading, isError } = useListing(
    isValidId ? BigInt(listingId) : BigInt(0)
  );
  const { data: reputationScore } = useReputationScore(address);
  const { data: stakeTier } = useStakeTier(address);

  // Type the on-chain listing struct
  const listing = listingData as
    | {
        id: bigint;
        provider: `0x${string}`;
        category: number;
        title: string;
        description: string;
        pricePerUnit: bigint;
        settlementToken: `0x${string}`;
        estimatedDeliverySeconds: bigint;
        metadataURI: string;
        active: boolean;
        createdAt: bigint;
      }
    | undefined;

  // Invalid ID — show not found
  if (!isValidId) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Listing not found</p>
          <p className="text-sm text-text-tertiary">
            Invalid listing ID. Please check the URL and try again.
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

  // Loading skeleton
  if (listingLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="card p-5 animate-pulse"
          >
            <div className="h-4 bg-surface-3 rounded w-1/3 mb-3" />
            <div className="h-3 bg-surface-3 rounded w-2/3 mb-2" />
            <div className="h-3 bg-surface-3 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  // 404 state: no listing data returned or error
  if (!listing || isError) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Listing not found</p>
          <p className="text-sm text-text-tertiary">
            The listing you are looking for does not exist or has been removed.
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

  // Derive display values from on-chain data
  const displayTitle = listing.title || `Listing #${listingId}`;
  const displayDescription = listing.description || "No description available.";
  const displayPrice = Number(formatEther(listing.pricePerUnit));
  const displayToken = "LOB";

  const deliverySeconds = Number(listing.estimatedDeliverySeconds);
  const displayDelivery =
    deliverySeconds > 0
      ? deliverySeconds < 86400
        ? `${Math.round(deliverySeconds / 3600)}h`
        : `${Math.round(deliverySeconds / 86400)}d`
      : "--";

  // Provider display values
  const providerReputation =
    reputationScore !== undefined ? Number(reputationScore).toLocaleString() : "--";
  const providerStakeTier =
    stakeTier !== undefined
      ? ["None", "Bronze", "Silver", "Gold", "Platinum"][Number(stakeTier)] ?? "--"
      : "--";

  return (
    <motion.div
      className="max-w-3xl mx-auto"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {/* Breadcrumb */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
        <Link href="/marketplace" className="hover:text-text-secondary transition-colors">
          Marketplace
        </Link>
        <span>/</span>
        <span className="text-text-secondary tabular-nums">#{listingId}</span>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-6">
        <motion.div
          className="inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-lob-green-muted text-lob-green border border-lob-green/20 mb-2"
          animate={{
            borderColor: [
              "rgba(88,176,89,0.2)",
              "rgba(88,176,89,0.4)",
              "rgba(88,176,89,0.2)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          {listing.active ? "Active Listing" : "Inactive Listing"}
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">{displayTitle}</h1>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Description */}
        <motion.div variants={fadeUp} className="md:col-span-2 card p-5 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-32 h-32 bg-lob-green/[0.02] rounded-full blur-[40px] pointer-events-none" />
          <h2 className="text-sm font-semibold text-text-primary mb-2">Description</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            {displayDescription}
          </p>
        </motion.div>

        {/* Sidebar */}
        <motion.div variants={fadeUp} className="space-y-3">
          <div className="card p-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider">Price</p>
                <motion.p
                  className="text-2xl font-bold text-text-primary mt-0.5 tabular-nums"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, ease }}
                >
                  {displayPrice.toLocaleString()} <span className="text-sm text-text-tertiary font-normal">{displayToken}</span>
                </motion.p>
              </div>
              <div className="h-px bg-border/60" />
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider">Est. Delivery</p>
                <p className="text-lg font-semibold text-text-primary mt-0.5">{displayDelivery}</p>
              </div>
            </div>
          </div>

          {isConnected ? (
            <>
              <motion.button
                className="btn-primary w-full"
                whileHover={{
                  boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)",
                }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowHireModal(true)}
              >
                Hire This Agent
              </motion.button>
              <Link
                href={`/forum/messages?compose=${listing.provider}`}
                className="block w-full text-center text-xs py-2 rounded-lg border border-border text-text-secondary hover:border-lob-green/30 hover:text-lob-green transition-colors"
              >
                Message Provider
              </Link>
              <HireModal
                open={showHireModal}
                onClose={() => setShowHireModal(false)}
                listingId={listing.id}
                seller={listing.provider}
                amount={listing.pricePerUnit}
                token={listing.settlementToken}
                tokenSymbol={displayToken}
                title={displayTitle}
              />
              <button
                onClick={() => setShowReportModal(true)}
                className="text-xs text-text-tertiary hover:text-lob-red transition-colors text-center w-full"
              >
                Report this listing
              </button>
              <ReportModal
                open={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetType="listing"
                targetId={listingId}
                evidence={{
                  listingId,
                  targetAddress: listing.provider,
                  timestamps: [Number(listing.createdAt)],
                }}
              />
            </>
          ) : (
            <div className="card p-3 text-center">
              <p className="text-xs text-text-tertiary">Connect wallet to hire</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Provider info */}
      <motion.div variants={fadeUp} className="card p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Provider</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Reputation", value: providerReputation },
            { label: "Address", value: `${listing.provider.slice(0, 6)}...${listing.provider.slice(-4)}` },
            { label: "Stake Tier", value: providerStakeTier },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08, ease }}
            >
              <p className="text-xs text-text-tertiary uppercase tracking-wider">{item.label}</p>
              <p className="text-sm text-text-primary font-medium mt-0.5 tabular-nums">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Reputation Radar */}
      <motion.div variants={fadeUp} className="card p-5 mt-4">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Provider Analytics</h2>
        <div className="flex justify-center">
          <ReputationRadar
            data={{
              deliverySpeed: Math.min(100, Math.max(10, reputationScore ? Number(reputationScore) / 80 : 50)),
              completionRate: Math.min(100, Math.max(20, reputationScore ? Number(reputationScore) / 60 : 60)),
              disputeWinRate: Math.min(100, Math.max(10, reputationScore ? Number(reputationScore) / 100 : 40)),
              responseTime: Math.min(100, Math.max(15, reputationScore ? Number(reputationScore) / 70 : 55)),
              jobVolume: Math.min(100, Math.max(5, reputationScore ? Number(reputationScore) / 90 : 30)),
              stakeAmount: stakeTier !== undefined ? Math.min(100, Number(stakeTier) * 25) : 10,
            }}
            size={200}
          />
        </div>
      </motion.div>

      {/* Escrow Flow Preview */}
      <motion.div variants={fadeUp} className="mt-4">
        <EscrowFlowAnimation
          status="pending"
          amount={displayPrice.toLocaleString()}
          token={displayToken}
        />
      </motion.div>
    </motion.div>
  );
}
