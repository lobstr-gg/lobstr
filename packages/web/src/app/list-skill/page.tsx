"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { formatEther, parseEther, keccak256, toHex } from "viem";
import { SkillRegistryABI, LOBTokenABI } from "@/config/abis";
import { getContracts, CHAIN, USDC } from "@/config/contracts";
import {
  useMarketplaceTier,
  useSellerListingCount,
} from "@/lib/useSkills";
import {
  AssetType,
  PricingModel,
  DeliveryMethod,
  TIER_LABELS,
  ASSET_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  DELIVERY_METHOD_LABELS,
  TIER_MAX_LISTINGS,
  ASSET_TYPE_MIN_TIER,
  useSkillRegistryAllowance,
} from "@/lib/useSkills";
import { useLOBBalance } from "@/lib/hooks";
import type { Variants } from "framer-motion";

const BYTES32_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease },
  }),
};

export default function ListSkillPage() {
  const { isConnected, address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const { data: lobBalance } = useLOBBalance(address);
  const { data: userTier } = useMarketplaceTier(address);
  const { data: listingCount } = useSellerListingCount(address);
  const currentAllowance = useSkillRegistryAllowance();

  const tier = typeof userTier === "number" ? userTier : Number(userTier ?? 0);
  const count = typeof listingCount === "number" ? listingCount : Number(listingCount ?? 0);

  // ── Approve LOB write ──
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveWriteError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveConfirmError,
  } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // ── List skill write ──
  const {
    writeContract: writeList,
    data: listTxHash,
    isPending: isListPending,
    error: listWriteError,
    reset: resetList,
  } = useWriteContract();

  const {
    isLoading: isListConfirming,
    isSuccess: isListSuccess,
    error: listConfirmError,
  } = useWaitForTransactionReceipt({ hash: listTxHash });

  const approving = isApprovePending || isApproveConfirming;
  const submitting = isListPending || isListConfirming;
  const submitted = isListSuccess;
  const txError = approveWriteError || approveConfirmError || listWriteError || listConfirmError;

  // ── Section 1: Details ──
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetType, setAssetType] = useState<number>(AssetType.SKILL);
  const [deliveryMethod, setDeliveryMethod] = useState<number>(DeliveryMethod.HOSTED_API);
  const [pricingModel, setPricingModel] = useState<number>(PricingModel.ONE_TIME);

  // ── Section 2: Pricing ──
  const [price, setPrice] = useState("");
  const [payInLOB, setPayInLOB] = useState(true);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [packageHash, setPackageHash] = useState("");

  // ── Section 3: Metadata ──
  const [metadataURI, setMetadataURI] = useState("");

  // ── Validation ──
  const tierTooLow = tier < ASSET_TYPE_MIN_TIER[assetType];
  const listingCapReached = count >= TIER_MAX_LISTINGS[tier];
  const priceNum = parseFloat(price) || 0;
  const isValid =
    title.trim().length > 0 &&
    priceNum > 0 &&
    !tierTooLow &&
    !listingCapReached;

  // ── Needs approval check ──
  const priceWei = priceNum > 0 ? parseEther(price) : 0n;
  const needsApproval = payInLOB && priceWei > 0n && currentAllowance < priceWei;

  // ── Submit handler ──
  const handleSubmit = () => {
    if (!isValid || submitting || submitted || !contracts) return;
    resetApprove();
    resetList();

    const settlementToken = payInLOB
      ? contracts.lobToken
      : USDC[CHAIN.id];

    const apiHash =
      deliveryMethod !== DeliveryMethod.CODE_PACKAGE && apiEndpoint.trim()
        ? keccak256(toHex(apiEndpoint.trim()))
        : BYTES32_ZERO;

    const pkgHash =
      deliveryMethod !== DeliveryMethod.HOSTED_API && packageHash.trim()
        ? keccak256(toHex(packageHash.trim()))
        : BYTES32_ZERO;

    if (needsApproval) {
      // Step 1: approve, then user clicks again to list
      writeApprove({
        address: contracts.lobToken,
        abi: LOBTokenABI,
        functionName: "approve",
        args: [contracts.skillRegistry, priceWei],
      });
      return;
    }

    // Step 2: list the skill
    // listSkill takes (ListSkillParams struct, title, description, metadataURI, requiredSkills[])
    writeList({
      address: contracts.skillRegistry,
      abi: SkillRegistryABI,
      functionName: "listSkill",
      args: [
        {
          assetType,
          deliveryMethod,
          pricingModel,
          price: priceWei,
          settlementToken,
          apiEndpointHash: apiHash,
          packageHash: pkgHash,
        },
        title,
        description,
        metadataURI,
        [], // requiredSkills — no dependencies for now
      ],
    });
  };

  // ── Not connected ──
  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-full border border-border flex items-center justify-center mb-2"
          animate={{
            borderColor: [
              "rgba(30,36,49,1)",
              "rgba(88,176,89,0.4)",
              "rgba(30,36,49,1)",
            ],
            boxShadow: [
              "0 0 0px rgba(88,176,89,0)",
              "0 0 20px rgba(88,176,89,0.1)",
              "0 0 0px rgba(88,176,89,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <span className="text-lob-green text-xl font-bold">+</span>
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">List a Skill</h1>
        <p className="text-sm text-text-secondary">
          Connect your wallet to list a skill on the marketplace.
        </p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div className="max-w-2xl mx-auto" initial="hidden" animate="show">
      <motion.div className="mb-6" variants={fadeUp} custom={0}>
        <h1 className="text-xl font-bold text-text-primary">List a Skill</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Publish a skill, agent template, or pipeline to the marketplace
        </p>
      </motion.div>

      {/* ── Section 1: Details ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={1}
      >
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />

        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Details
        </h2>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., GPT-4 Summarizer API"
            maxLength={256}
            className="input-field"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your skill does, its inputs/outputs, and any requirements..."
            maxLength={1024}
            rows={5}
            className="input-field resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-[10px] text-text-tertiary">
              Be specific about capabilities, expected inputs, and output format
            </p>
            <motion.p
              className="text-[10px] tabular-nums"
              animate={{
                color:
                  description.length > 900
                    ? "rgba(88,176,89,0.8)"
                    : "rgba(94,102,115,1)",
              }}
            >
              {description.length}/1024
            </motion.p>
          </div>
        </div>

        {/* Asset Type */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Asset Type
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {[AssetType.SKILL, AssetType.AGENT_TEMPLATE, AssetType.PIPELINE].map((type, idx) => (
              <motion.button
                key={type}
                onClick={() => setAssetType(type)}
                className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  assetType === type
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                } ${idx !== 0 ? "border-l border-border" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {assetType === type && (
                  <motion.div
                    layoutId="asset-type-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{ASSET_TYPE_LABELS[type]}</span>
              </motion.button>
            ))}
          </div>
          {tierTooLow && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 mt-2">
              <p className="text-[10px] text-amber-400">
                {ASSET_TYPE_LABELS[assetType]} requires {TIER_LABELS[ASSET_TYPE_MIN_TIER[assetType]]} tier or above.
                Your current tier: {TIER_LABELS[tier]}.
              </p>
            </div>
          )}
        </div>

        {/* Delivery Method */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Delivery Method
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {[DeliveryMethod.HOSTED_API, DeliveryMethod.CODE_PACKAGE, DeliveryMethod.BOTH].map((method, idx) => (
              <motion.button
                key={method}
                onClick={() => setDeliveryMethod(method)}
                className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  deliveryMethod === method
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                } ${idx !== 0 ? "border-l border-border" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {deliveryMethod === method && (
                  <motion.div
                    layoutId="delivery-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{DELIVERY_METHOD_LABELS[method]}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Pricing Model */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Pricing Model
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {[PricingModel.ONE_TIME, PricingModel.PER_CALL, PricingModel.SUBSCRIPTION].map((model, idx) => (
              <motion.button
                key={model}
                onClick={() => setPricingModel(model)}
                className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  pricingModel === model
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                } ${idx !== 0 ? "border-l border-border" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {pricingModel === model && (
                  <motion.div
                    layoutId="pricing-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{PRICING_MODEL_LABELS[model]}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Section 2: Pricing ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={2}
      >
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Pricing
        </h2>

        {/* Price + token toggle */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Price
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="input-field flex-1 tabular-nums"
            />
            <div className="flex rounded-md border border-border overflow-hidden">
              <motion.button
                onClick={() => setPayInLOB(true)}
                className={`px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap relative ${
                  payInLOB
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {payInLOB && (
                  <motion.div
                    layoutId="pay-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">LOB 0%</span>
              </motion.button>
              <motion.button
                onClick={() => setPayInLOB(false)}
                className={`px-3 py-2.5 text-xs font-medium transition-colors border-l border-border whitespace-nowrap relative ${
                  !payInLOB
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {!payInLOB && (
                  <motion.div
                    layoutId="pay-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">USDC 1.5%</span>
              </motion.button>
            </div>
          </div>
          {payInLOB && lobBalance !== undefined && (
            <p className="text-[10px] text-text-tertiary mt-1">
              Available: {Number(formatEther(lobBalance)).toLocaleString()} LOB
            </p>
          )}
          <p className="text-[10px] text-text-tertiary mt-1">
            LOB payments have 0% protocol fee. USDC payments incur a 1.5% fee.
          </p>
        </div>

        {/* API Endpoint URL */}
        {deliveryMethod !== DeliveryMethod.CODE_PACKAGE && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              API Endpoint URL
            </label>
            <input
              type="url"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://api.example.com/v1/skill"
              className="input-field"
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              Stored on-chain as a keccak256 hash for privacy. Only buyers with access can resolve the URL.
            </p>
          </div>
        )}

        {/* Package Hash */}
        {deliveryMethod !== DeliveryMethod.HOSTED_API && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              Package Reference
            </label>
            <input
              type="text"
              value={packageHash}
              onChange={(e) => setPackageHash(e.target.value)}
              placeholder="ipfs://Qm... or github.com/org/repo"
              className="input-field"
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              Repository URL or IPFS CID. Stored on-chain as a keccak256 hash.
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Section 3: Metadata ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={3}
      >
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Metadata
        </h2>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Metadata URI
          </label>
          <input
            type="url"
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            placeholder="ipfs://... or ar://..."
            className="input-field"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            Link to a JSON file on IPFS or Arweave with extended metadata.
          </p>
        </div>

        {deliveryMethod !== DeliveryMethod.CODE_PACKAGE && (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <p className="text-[10px] text-blue-400">
              <span className="font-semibold">Hint:</span> For hosted API skills, your metadata JSON
              should contain{" "}
              <code className="bg-surface-3 px-1 py-0.5 rounded text-[9px]">
                {"{ apiEndpoint, description, schema }"}
              </code>{" "}
              so buyers can discover and integrate your endpoint.
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Section 4: Submit ── */}
      <motion.div
        className="card p-5 space-y-4"
        variants={fadeUp}
        custom={4}
      >
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          {title && (
            <span className="text-text-primary font-medium break-words">
              {title}
            </span>
          )}
          {priceNum > 0 && (
            <span className="tabular-nums">
              <span className={payInLOB ? "text-lob-green" : ""}>
                {priceNum.toLocaleString()}
              </span>{" "}
              {payInLOB ? "LOB" : "USDC"}
            </span>
          )}
          <span>{ASSET_TYPE_LABELS[assetType]}</span>
          <span>{PRICING_MODEL_LABELS[pricingModel]}</span>
        </div>

        {/* Listing cap warning */}
        {listingCapReached && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-[10px] text-amber-400">
              You have reached the maximum number of listings ({TIER_MAX_LISTINGS[tier]}) for the{" "}
              {TIER_LABELS[tier]} tier. Upgrade your tier to list more skills.
            </p>
          </div>
        )}

        {/* Approval success */}
        <AnimatePresence>
          {isApproveSuccess && !submitted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="rounded-md border border-lob-green/30 bg-lob-green-muted px-4 py-3 text-xs text-lob-green"
            >
              LOB approved. Click below to submit your listing.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success */}
        <AnimatePresence>
          {submitted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="rounded-md border border-lob-green/30 bg-lob-green-muted px-4 py-3 text-xs text-lob-green"
            >
              Skill listed successfully! It will appear on the marketplace shortly.
              {listTxHash && (
                <span className="block mt-1 font-mono text-[10px] text-text-tertiary break-all">
                  Tx: {listTxHash}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {txError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400"
            >
              {(txError as Error).message?.slice(0, 200) || "Transaction failed"}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={!isValid || approving || submitting || submitted}
          whileHover={
            isValid && !approving && !submitting && !submitted
              ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }
              : {}
          }
          whileTap={isValid && !approving && !submitting ? { scale: 0.97 } : {}}
          onClick={handleSubmit}
        >
          {isApprovePending
            ? "Approving LOB..."
            : isApproveConfirming
            ? "Confirming Approval..."
            : isListPending
            ? "Submitting..."
            : isListConfirming
            ? "Confirming..."
            : submitted
            ? "Listed"
            : needsApproval
            ? "Approve LOB"
            : "List Skill"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
