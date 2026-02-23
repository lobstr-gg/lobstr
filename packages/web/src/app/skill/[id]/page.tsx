"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { formatEther, type Address } from "viem";
import Link from "next/link";
import { SkillRegistryABI } from "@/config/abis";
import { getContracts, CHAIN, getExplorerUrl } from "@/config/contracts";
import {
  AssetType,
  PricingModel,
  DeliveryMethod,
  ASSET_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  DELIVERY_METHOD_LABELS,
  type SkillListing,
  formatSkillPrice,
  shortenAddress,
  useSkillRegistryAllowance,
} from "@/lib/useSkills";
import {
  useHasActiveAccess,
  useSkillDependencies,
  useBuyerCredits,
  useDeactivateSkill,
  useSkill,
} from "@/lib/hooks";
import PurchasePanel from "./_components/PurchasePanel";
import EditSkillModal from "./_components/EditSkillModal";

// ── Badge color maps ─────────────────────────────────────────────────

const ASSET_TYPE_COLORS: Record<number, string> = {
  [AssetType.SKILL]: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  [AssetType.AGENT_TEMPLATE]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  [AssetType.PIPELINE]: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const PRICING_MODEL_COLORS: Record<number, string> = {
  [PricingModel.ONE_TIME]: "bg-lob-green-muted text-lob-green border-lob-green/20",
  [PricingModel.PER_CALL]: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  [PricingModel.SUBSCRIPTION]: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const DELIVERY_METHOD_COLORS: Record<number, string> = {
  [DeliveryMethod.HOSTED_API]: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  [DeliveryMethod.CODE_PACKAGE]: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  [DeliveryMethod.BOTH]: "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

export default function SkillDetailPage() {
  const params = useParams();
  const skillIdParam = params.id as string;
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = getContracts(CHAIN.id);

  const [skill, setSkill] = useState<SkillListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const isValidId = /^\d+$/.test(skillIdParam);
  const skillId = isValidId ? BigInt(skillIdParam) : BigInt(0);

  // Fetch skill data
  const fetchSkill = useCallback(async () => {
    if (!publicClient || !contracts?.skillRegistry || !isValidId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);

      const result = await publicClient.readContract({
        address: contracts.skillRegistry,
        abi: SkillRegistryABI,
        functionName: "getSkill",
        args: [skillId],
      });

      const data = result as unknown as SkillListing;
      // Check if skill exists (seller is not zero address)
      if (data && data.seller !== "0x0000000000000000000000000000000000000000") {
        setSkill(data);
      } else {
        setSkill(null);
      }
    } catch (err) {
      console.error("Failed to fetch skill:", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, contracts, skillId, isValidId]);

  useEffect(() => {
    fetchSkill();
  }, [fetchSkill]);

  // Access check
  const { data: hasAccess } = useHasActiveAccess(address, skillId);

  // Dependencies
  const { data: dependencies } = useSkillDependencies(skillId);
  const depIds = (dependencies as bigint[] | undefined) ?? [];

  // Buyer credits for per-call model
  const { data: credits } = useBuyerCredits(address, skill?.settlementToken);

  // Deactivate hook
  const deactivateSkill = useDeactivateSkill();

  const isSeller = skill && address && skill.seller.toLowerCase() === address.toLowerCase();

  // ── Invalid ID ──────────────────────────────────────────────────────

  if (!isValidId) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Skill not found</p>
          <p className="text-sm text-text-tertiary">
            Invalid skill ID. Please check the URL and try again.
          </p>
          <Link
            href="/marketplace"
            className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80 transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="card p-5 animate-pulse">
          <div className="h-3 bg-surface-3 rounded w-24 mb-4" />
          <div className="h-6 bg-surface-3 rounded w-1/2 mb-3" />
          <div className="h-3 bg-surface-3 rounded w-3/4 mb-2" />
          <div className="h-3 bg-surface-3 rounded w-2/3" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 bg-surface-3 rounded w-1/3 mb-3" />
                <div className="h-3 bg-surface-3 rounded w-2/3 mb-2" />
                <div className="h-3 bg-surface-3 rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="card p-5 animate-pulse">
              <div className="h-3 bg-surface-3 rounded w-16 mb-2" />
              <div className="h-8 bg-surface-3 rounded w-32 mb-3" />
              <div className="h-10 bg-surface-3 rounded w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 404 state ──────────────────────────────────────────────────────

  if (!skill || isError) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Skill not found</p>
          <p className="text-sm text-text-tertiary">
            The skill you are looking for does not exist or has been removed.
          </p>
          <Link
            href="/marketplace"
            className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80 transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────

  const displayPrice = formatSkillPrice(skill.price, skill.settlementToken, contracts?.lobToken);
  const createdDate = new Date(Number(skill.createdAt) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const updatedDate = new Date(Number(skill.updatedAt) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      className="max-w-4xl mx-auto"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {/* Breadcrumb */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
        <Link href="/skills-market" className="hover:text-text-secondary transition-colors">
          Skills Market
        </Link>
        <span>/</span>
        <span className="text-text-secondary tabular-nums">#{skillIdParam}</span>
      </motion.div>

      {/* Status + Title header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <motion.div
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${
              skill.active
                ? "bg-lob-green-muted text-lob-green border-lob-green/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}
            animate={
              skill.active
                ? {
                    borderColor: [
                      "rgba(88,176,89,0.2)",
                      "rgba(88,176,89,0.4)",
                      "rgba(88,176,89,0.2)",
                    ],
                  }
                : undefined
            }
            transition={{ duration: 3, repeat: Infinity }}
          >
            {skill.active ? "Active" : "Inactive"}
          </motion.div>
          {hasAccess && (
            <div className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-lob-green/20 text-lob-green border border-lob-green/30">
              Access Active
            </div>
          )}
        </div>
        <h1 className="text-xl font-bold text-text-primary">{skill.title || `Skill #${skillIdParam}`}</h1>
        <Link
          href={`/profile/${skill.seller}`}
          className="text-xs text-text-tertiary hover:text-lob-green transition-colors mt-1 inline-block"
        >
          by {shortenAddress(skill.seller)}
        </Link>
      </motion.div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Left column */}
        <div className="md:col-span-2 space-y-4">
          {/* Description card */}
          <motion.div variants={fadeUp} className="card p-5 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-32 h-32 bg-lob-green/[0.02] rounded-full blur-[40px] pointer-events-none" />
            <h2 className="text-sm font-semibold text-text-primary mb-2">Description</h2>
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
              {skill.description || "No description available."}
            </p>
            {skill.metadataURI && (
              <a
                href={skill.metadataURI}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-lob-green hover:underline mt-3 inline-block"
              >
                View Metadata
              </a>
            )}
          </motion.div>

          {/* Badges row */}
          <motion.div variants={fadeUp} className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Details</h2>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
                  ASSET_TYPE_COLORS[skill.assetType] ?? "bg-surface-3 text-text-tertiary border-border"
                }`}
              >
                {ASSET_TYPE_LABELS[skill.assetType] ?? "Unknown"}
              </span>
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
                  PRICING_MODEL_COLORS[skill.pricingModel] ?? "bg-surface-3 text-text-tertiary border-border"
                }`}
              >
                {PRICING_MODEL_LABELS[skill.pricingModel] ?? "Unknown"}
              </span>
              <span
                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
                  DELIVERY_METHOD_COLORS[skill.deliveryMethod] ?? "bg-surface-3 text-text-tertiary border-border"
                }`}
              >
                {DELIVERY_METHOD_LABELS[skill.deliveryMethod] ?? "Unknown"}
              </span>
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div variants={fadeUp} className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Statistics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Purchases", value: skill.totalPurchases.toString() },
                { label: "API Calls", value: skill.totalCalls.toString() },
                { label: "Version", value: `v${skill.version.toString()}` },
                { label: "Created", value: createdDate },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.06, ease }}
                >
                  <p className="text-xs text-text-tertiary uppercase tracking-wider">{stat.label}</p>
                  <p className="text-sm text-text-primary font-medium mt-0.5 tabular-nums">{stat.value}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Hashes card */}
          <motion.div variants={fadeUp} className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Verification</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  API Endpoint Hash
                </p>
                <p className="text-xs text-text-tertiary font-mono break-all bg-surface-2/50 rounded px-2 py-1.5">
                  {skill.apiEndpointHash}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Package Hash
                </p>
                <p className="text-xs text-text-tertiary font-mono break-all bg-surface-2/50 rounded px-2 py-1.5">
                  {skill.packageHash}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Last Updated
                </p>
                <p className="text-xs text-text-tertiary">{updatedDate}</p>
              </div>
            </div>
          </motion.div>

          {/* Dependencies section */}
          {depIds.length > 0 && (
            <motion.div variants={fadeUp} className="card p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-3">
                Dependencies ({depIds.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {depIds.map((depId) => (
                  <Link
                    key={depId.toString()}
                    href={`/skill/${depId.toString()}`}
                    className="card p-3 hover:border-lob-green/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-primary group-hover:text-lob-green transition-colors">
                        Skill #{depId.toString()}
                      </span>
                      <span className="text-[10px] text-text-tertiary">Required</span>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Seller info */}
          <motion.div variants={fadeUp} className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Seller</h2>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-lob-green/10 flex items-center justify-center text-xs font-bold text-lob-green">
                {skill.seller.slice(2, 4).toUpperCase()}
              </div>
              <div>
                <Link
                  href={`/profile/${skill.seller}`}
                  className="text-sm text-text-primary font-medium hover:text-lob-green transition-colors"
                >
                  {shortenAddress(skill.seller)}
                </Link>
                <a
                  href={getExplorerUrl("address", skill.seller)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  View on BaseScan
                </a>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right column — sidebar */}
        <motion.div variants={fadeUp} className="space-y-3">
          {/* Price card */}
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
                  {displayPrice}
                </motion.p>
              </div>
              <div className="h-px bg-border/60" />
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wider">Model</p>
                <p className="text-sm font-semibold text-text-primary mt-0.5">
                  {PRICING_MODEL_LABELS[skill.pricingModel] ?? "Unknown"}
                </p>
              </div>
              {skill.pricingModel === PricingModel.SUBSCRIPTION && (
                <>
                  <div className="h-px bg-border/60" />
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider">Billing</p>
                    <p className="text-sm font-semibold text-text-primary mt-0.5">Monthly</p>
                  </div>
                </>
              )}
              {skill.pricingModel === PricingModel.PER_CALL && credits !== undefined && (
                <>
                  <div className="h-px bg-border/60" />
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider">Your Credits</p>
                    <p className="text-sm font-semibold text-text-primary mt-0.5 tabular-nums">
                      {Number(formatEther(credits as bigint)).toLocaleString()} LOB
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Purchase panel or connect prompt */}
          {isConnected ? (
            <>
              <PurchasePanel skill={skill} onPurchased={fetchSkill} />

              {/* Seller controls */}
              {isSeller && (
                <div className="space-y-2">
                  <motion.button
                    className="w-full text-xs py-2.5 rounded-lg border border-border text-text-secondary hover:border-lob-green/30 hover:text-lob-green transition-colors"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowEditModal(true)}
                  >
                    Edit Skill
                  </motion.button>
                  {skill.active && (
                    <motion.button
                      className="w-full text-xs py-2.5 rounded-lg border border-red-500/20 text-red-400 hover:border-red-500/40 hover:bg-red-500/5 transition-colors"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (confirm("Are you sure you want to deactivate this skill?")) {
                          deactivateSkill(skillId);
                        }
                      }}
                    >
                      Deactivate Skill
                    </motion.button>
                  )}
                </div>
              )}

              <EditSkillModal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                skill={skill}
                onUpdated={fetchSkill}
              />
            </>
          ) : (
            <div className="card p-5 text-center space-y-3">
              <p className="text-xs text-text-tertiary">Connect wallet to purchase</p>
              <ConnectButton />
            </div>
          )}

          {/* Settlement token info */}
          <div className="card p-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Settlement Token</p>
            <a
              href={getExplorerUrl("address", skill.settlementToken)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-secondary hover:text-lob-green transition-colors font-mono"
            >
              {shortenAddress(skill.settlementToken)}
            </a>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
