"use client";

import { useState, useEffect } from "react";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { formatEther, parseEther, type Address } from "viem";
import { getContracts, CHAIN, getExplorerUrl } from "@/config/contracts";
import {
  type SkillListing,
  PricingModel,
  formatSkillPrice,
  useSkillRegistryAllowance,
} from "@/lib/useSkills";
import {
  useHasActiveAccess,
  useApproveToken,
  usePurchaseSkill,
  useDepositCallCredits,
} from "@/lib/hooks";

type Step = "idle" | "approve" | "purchase" | "success";

interface PurchasePanelProps {
  skill: SkillListing;
  onPurchased?: () => void;
}

export default function PurchasePanel({ skill, onPurchased }: PurchasePanelProps) {
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const allowance = useSkillRegistryAllowance();
  const { data: hasAccess } = useHasActiveAccess(address, skill.id);

  const approveToken = useApproveToken();
  const purchaseSkill = usePurchaseSkill();
  const depositCredits = useDepositCallCredits();

  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Address | undefined>();
  const [purchaseTxHash, setPurchaseTxHash] = useState<Address | undefined>();
  const [depositAmount, setDepositAmount] = useState("");

  // Wait for approval tx
  const { isLoading: waitingApproval, isSuccess: approvalConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      query: { enabled: !!txHash },
    });

  // Wait for purchase tx
  const { isLoading: waitingPurchase, isSuccess: purchaseConfirmed } =
    useWaitForTransactionReceipt({
      hash: purchaseTxHash,
      query: { enabled: !!purchaseTxHash },
    });

  // Auto-advance after approval confirms
  const [approvalProcessed, setApprovalProcessed] = useState(false);
  useEffect(() => {
    if (approvalConfirmed && !approvalProcessed) {
      setApprovalProcessed(true);
      setStep("purchase");
      setLoading(false);
    }
  }, [approvalConfirmed, approvalProcessed]);

  // Auto-advance after purchase confirms
  const [purchaseProcessed, setPurchaseProcessed] = useState(false);
  useEffect(() => {
    if (purchaseConfirmed && !purchaseProcessed) {
      setPurchaseProcessed(true);
      setStep("success");
      setLoading(false);
      onPurchased?.();
    }
  }, [purchaseConfirmed, purchaseProcessed, onPurchased]);

  const needsApproval =
    skill.pricingModel === PricingModel.PER_CALL
      ? depositAmount
        ? allowance < parseEther(depositAmount)
        : false
      : allowance < skill.price;

  const isSeller =
    address && skill.seller.toLowerCase() === address.toLowerCase();

  // ── Handlers ───────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!contracts?.skillRegistry || !contracts?.lobToken) return;

    setLoading(true);
    setError(null);
    setApprovalProcessed(false);

    try {
      const approveAmount =
        skill.pricingModel === PricingModel.PER_CALL && depositAmount
          ? parseEther(depositAmount)
          : skill.price;

      const hash = await approveToken(
        contracts.lobToken,
        contracts.skillRegistry,
        approveAmount,
      );
      setTxHash(hash);
      setStep("approve");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    setLoading(true);
    setError(null);
    setPurchaseProcessed(false);

    try {
      const hash = await purchaseSkill.fn(skill.id);
      setPurchaseTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || !skill.settlementToken) return;

    setLoading(true);
    setError(null);
    setPurchaseProcessed(false);

    try {
      const hash = await depositCredits.fn(
        skill.settlementToken,
        parseEther(depositAmount),
      );
      setPurchaseTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
      setLoading(false);
    }
  };

  const handleStart = () => {
    if (needsApproval) {
      handleApprove();
    } else if (skill.pricingModel === PricingModel.PER_CALL) {
      handleDeposit();
    } else {
      setStep("purchase");
      handlePurchase();
    }
  };

  const resetFlow = () => {
    setStep("idle");
    setLoading(false);
    setError(null);
    setTxHash(undefined);
    setPurchaseTxHash(undefined);
    setApprovalProcessed(false);
    setPurchaseProcessed(false);
    setDepositAmount("");
  };

  // ── Already has access ─────────────────────────────────────────────

  if (hasAccess && skill.pricingModel !== PricingModel.PER_CALL) {
    return (
      <div className="card p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-lob-green/20 flex items-center justify-center mx-auto mb-2">
          <span className="text-lob-green text-lg">{"\u2713"}</span>
        </div>
        <p className="text-sm font-medium text-text-primary">Access Active</p>
        <p className="text-[10px] text-text-tertiary mt-1">
          You have active access to this skill.
        </p>
      </div>
    );
  }

  // ── Seller cannot purchase own skill ───────────────────────────────

  if (isSeller) {
    return (
      <div className="card p-4 text-center">
        <p className="text-xs text-text-tertiary">
          You are the seller of this skill.
        </p>
      </div>
    );
  }

  // ── Action labels per pricing model ────────────────────────────────

  const actionLabel =
    skill.pricingModel === PricingModel.ONE_TIME
      ? "Purchase"
      : skill.pricingModel === PricingModel.PER_CALL
      ? "Deposit Credits"
      : "Subscribe";

  const actionLabelProgress =
    skill.pricingModel === PricingModel.ONE_TIME
      ? "Purchasing..."
      : skill.pricingModel === PricingModel.PER_CALL
      ? "Depositing..."
      : "Subscribing...";

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="card p-5 space-y-4">
      {/* Step indicator */}
      {step !== "idle" && step !== "success" && (
        <div className="flex items-center gap-2 mb-2">
          {["Approve", actionLabel].map((label, i) => {
            const isActive =
              (i === 0 && step === "approve") ||
              (i === 1 && step === "purchase");
            const isDone =
              (i === 0 && step === "purchase");
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isDone
                      ? "bg-lob-green text-black"
                      : isActive
                      ? "bg-lob-green/20 text-lob-green border border-lob-green/40"
                      : "bg-surface-3 text-text-tertiary"
                  }`}
                >
                  {isDone ? "\u2713" : i + 1}
                </div>
                <span
                  className={`text-xs ${
                    isActive ? "text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  {label}
                </span>
                {i === 0 && <div className="flex-1 h-px bg-border/30" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-call deposit amount input */}
      {skill.pricingModel === PricingModel.PER_CALL && step === "idle" && (
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider block">
            Deposit Amount (LOB)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 100"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="input-field"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            Credits are deducted per API call. Price per call:{" "}
            {formatSkillPrice(skill.price, skill.settlementToken, contracts?.lobToken)}
          </p>
        </div>
      )}

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success state */}
      {step === "success" && (
        <div className="text-center py-2">
          <div className="w-10 h-10 rounded-full bg-lob-green/20 flex items-center justify-center mx-auto mb-2">
            <span className="text-lob-green text-lg">{"\u2713"}</span>
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            {skill.pricingModel === PricingModel.PER_CALL
              ? "Credits Deposited"
              : skill.pricingModel === PricingModel.SUBSCRIPTION
              ? "Subscription Active"
              : "Purchase Complete"}
          </p>
          <p className="text-[10px] text-text-tertiary mb-2">
            {skill.pricingModel === PricingModel.PER_CALL
              ? "Your call credits have been deposited."
              : "You now have access to this skill."}
          </p>
          {purchaseTxHash && (
            <a
              href={getExplorerUrl("tx", purchaseTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-lob-green hover:underline"
            >
              View on BaseScan
            </a>
          )}
          <button
            onClick={resetFlow}
            className="block mx-auto mt-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Action buttons */}
      {step !== "success" && (
        <div className="space-y-2">
          {step === "idle" && (
            <motion.button
              className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
              whileHover={{
                boxShadow:
                  "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)",
              }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStart}
              disabled={
                loading ||
                !skill.active ||
                (skill.pricingModel === PricingModel.PER_CALL &&
                  (!depositAmount || parseFloat(depositAmount) <= 0))
              }
            >
              {needsApproval
                ? `Approve & ${actionLabel}`
                : actionLabel}
            </motion.button>
          )}

          {step === "approve" && (
            <motion.button
              className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.97 }}
              disabled
            >
              {waitingApproval ? "Confirming Approval..." : "Approving..."}
            </motion.button>
          )}

          {step === "purchase" && (
            <motion.button
              className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.97 }}
              onClick={
                skill.pricingModel === PricingModel.PER_CALL
                  ? handleDeposit
                  : handlePurchase
              }
              disabled={loading || waitingPurchase}
            >
              {loading || waitingPurchase
                ? actionLabelProgress
                : actionLabel}
            </motion.button>
          )}

          {step !== "idle" && (
            <button
              onClick={resetFlow}
              className="w-full text-xs text-text-tertiary hover:text-text-secondary transition-colors py-1"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
