"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, formatUnits, type Address } from "viem";
import {
  useApproveToken,
  useCreateJobWithHash,
  useLOBAllowance,
  useLOBBalance,
  useStakeInfo,
  useUSDCBalance,
  useUSDCAllowance,
  useX402Settle,
} from "@/lib/hooks";
import { getContracts, CHAIN, USDC, getExplorerUrl } from "@/config/contracts";
import { useIsTokenAllowed } from "@/lib/useEscrowUpdates";
import Link from "next/link";

type Step = "approve" | "create" | "success";

interface HireModalProps {
  open: boolean;
  onClose: () => void;
  listingId: bigint;
  seller: Address;
  amount: bigint;
  token: Address;
  tokenSymbol: string;
  title: string;
}

export default function HireModal({
  open,
  onClose,
  listingId,
  seller,
  amount,
  token,
  tokenSymbol,
  title,
}: HireModalProps) {
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const escrowAddress = contracts?.escrowEngine;
  const bridgeAddress = contracts?.x402EscrowBridge;
  const usdcAddress = USDC[CHAIN.id];

  // x402 mode state
  const [useX402, setUseX402] = useState(false);

  // USDC amount: convert from 18-decimal LOB amount to 6-decimal USDC equivalent
  // For listings already priced in USDC this is the same amount
  const usdcAmount = useX402 ? amount : BigInt(0);

  // Regular escrow hooks
  const { data: allowance, refetch: refetchAllowance } = useLOBAllowance(
    address,
    escrowAddress
  );
  const { data: lobBalance } = useLOBBalance(address);
  const { data: stakeInfo } = useStakeInfo(address);

  // x402 hooks
  const { data: usdcBalance } = useUSDCBalance(address);
  const { data: usdcAllowance, refetch: refetchUSDCAllowance } = useUSDCAllowance(
    address,
    bridgeAddress
  );
  const x402Settle = useX402Settle();

  // Token allowlist check — payment token must be on escrow allowlist
  const paymentToken = useX402 ? usdcAddress : token;
  const { data: tokenAllowed, isLoading: tokenAllowedLoading } = useIsTokenAllowed(paymentToken);
  const tokenNotAllowed = !tokenAllowedLoading && tokenAllowed === false && !!paymentToken;

  const hasInsufficientBalance = useX402
    ? usdcBalance !== undefined && usdcBalance < usdcAmount
    : lobBalance !== undefined && lobBalance < amount;
  const stakedAmount = stakeInfo ? (stakeInfo as unknown as [bigint, bigint, bigint])[0] : BigInt(0);

  const approveToken = useApproveToken();
  const createJob = useCreateJobWithHash();

  const [step, setStep] = useState<Step>("approve");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Address | undefined>();
  const [jobTxHash, setJobTxHash] = useState<Address | undefined>();
  const [bridgeJobId, setBridgeJobId] = useState<string | undefined>();

  const { isLoading: waitingApproval, isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  // Auto-advance to create step once tx receipt confirms
  const [approvalProcessed, setApprovalProcessed] = useState(false);
  if (approvalConfirmed && !approvalProcessed) {
    setApprovalProcessed(true);
    // Refetch allowance after confirmed receipt, then advance
    (useX402 ? refetchUSDCAllowance() : refetchAllowance()).then(() => {
      setStep("create");
      setLoading(false);
    });
  }

  const needsApproval = useX402
    ? !usdcAllowance || usdcAllowance < usdcAmount
    : !allowance || allowance < amount;

  const handleApprove = async () => {
    if (useX402) {
      if (!bridgeAddress || !usdcAddress) return;
      setLoading(true);
      setError(null);
      setApprovalProcessed(false);
      try {
        const hash = await approveToken(usdcAddress, bridgeAddress, usdcAmount);
        setTxHash(hash);
        // useWaitForTransactionReceipt will handle the rest
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approval failed");
        setLoading(false);
      }
    } else {
      if (!escrowAddress) return;
      setLoading(true);
      setError(null);
      setApprovalProcessed(false);
      try {
        const hash = await approveToken(token, escrowAddress, amount);
        setTxHash(hash);
        // useWaitForTransactionReceipt will handle the rest
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approval failed");
        setLoading(false);
      }
    }
  };

  const handleCreateJob = async () => {
    setLoading(true);
    setError(null);
    try {
      if (useX402) {
        if (!address || !usdcAddress) throw new Error("Wallet not connected");
        const result = await x402Settle({
          payer: address,
          token: usdcAddress,
          amount: usdcAmount,
          listingId,
          seller,
        });
        if (!result.success) {
          throw new Error(result.errorReason ?? "x402 settlement failed");
        }
        if (result.txHash) setJobTxHash(result.txHash as Address);
        if (result.jobId) setBridgeJobId(result.jobId);
        setStep("success");
      } else {
        const hash = await createJob(listingId, seller, amount, token);
        setJobTxHash(hash);
        setStep("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job creation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    if (needsApproval) {
      handleApprove();
    } else {
      setStep("create");
      handleCreateJob();
    }
  };

  const handleToggleX402 = (enabled: boolean) => {
    setUseX402(enabled);
    // Reset state when switching modes
    setStep("approve");
    setError(null);
    setTxHash(undefined);
    setJobTxHash(undefined);
    setBridgeJobId(undefined);
    setApprovalProcessed(false);
  };

  if (!open) return null;

  const displayAmount = useX402
    ? `${Number(formatUnits(usdcAmount, 6)).toLocaleString()} USDC`
    : `${Number(formatEther(amount)).toLocaleString()} ${tokenSymbol}`;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="card p-4 sm:p-6 w-full max-w-md mx-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold text-text-primary mb-1">
            Hire Agent
          </h2>
          <p className="text-xs text-text-tertiary mb-4 line-clamp-2">
            {title}
          </p>

          {/* Payment method toggle */}
          <div className="mb-4">
            <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
              Payment Method
            </label>
            <div className="flex rounded-md border border-border overflow-hidden">
              <motion.button
                onClick={() => handleToggleX402(false)}
                className={`relative flex-1 min-h-[44px] px-3 py-2 text-xs font-medium transition-colors ${
                  !useX402
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {!useX402 && (
                  <motion.div
                    layoutId="payment-method"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Direct Escrow</span>
              </motion.button>
              <motion.button
                onClick={() => handleToggleX402(true)}
                className={`relative flex-1 min-h-[44px] px-3 py-2 text-xs font-medium transition-colors border-l border-border ${
                  useX402
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {useX402 && (
                  <motion.div
                    layoutId="payment-method"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">x402 Bridge</span>
              </motion.button>
            </div>
          </div>

          {/* x402 explainer */}
          <AnimatePresence>
            {useX402 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 mb-4">
                  <p className="text-[10px] text-blue-400">
                    x402 routes your USDC payment through the bridge contract.
                    You sign a payment intent, and the facilitator settles it into
                    escrow on your behalf. Same dispute protection, same escrow guarantees.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Amount display */}
          <div className="card p-4 mb-4 bg-surface-2/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">Escrow Amount</span>
              <span className="text-lg font-bold text-lob-green tabular-nums">
                {displayAmount}
              </span>
            </div>
            <p className="text-[10px] text-text-tertiary mt-1">
              {useX402
                ? "Funds are deposited via x402 bridge into escrow until delivery is confirmed or dispute is resolved."
                : "Funds will be held in escrow until delivery is confirmed or dispute is resolved."}
            </p>
            {useX402 && usdcBalance !== undefined && (
              <p className="text-[10px] text-text-tertiary mt-1">
                USDC Balance: {Number(formatUnits(usdcBalance, 6)).toLocaleString()} USDC
              </p>
            )}
          </div>

          {/* Insufficient balance warning */}
          {hasInsufficientBalance && !useX402 && stakedAmount > BigInt(0) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-4">
              <p className="text-xs text-amber-400">
                Insufficient liquid LOB. You have {Number(formatEther(stakedAmount)).toLocaleString()} LOB staked.
                Unstake to use these funds.
              </p>
              <Link
                href="/staking"
                className="text-[10px] text-lob-green hover:underline mt-1 inline-block"
              >
                Go to Staking
              </Link>
            </div>
          )}
          {hasInsufficientBalance && useX402 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-4">
              <p className="text-xs text-amber-400">
                Insufficient USDC balance for this x402 payment.
              </p>
            </div>
          )}
          {tokenNotAllowed && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 mb-4">
              <p className="text-xs text-red-400">
                This payment token is not supported for escrow. Only allowlisted tokens can be
                used. Contact the team if you believe this is an error.
              </p>
            </div>
          )}

          {/* Steps */}
          <div className="flex items-center gap-2 mb-4">
            {[useX402 ? "Approve USDC" : "Approve", useX402 ? "Sign & Settle" : "Create Job"].map((label, i) => {
              const isActive =
                (i === 0 && step === "approve") ||
                (i === 1 && (step === "create" || step === "success"));
              const isDone =
                (i === 0 && step !== "approve") ||
                (i === 1 && step === "success");
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
                  {i === 0 && (
                    <div className="flex-1 h-px bg-border/30" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error display */}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
              {error}
            </div>
          )}

          {/* Success state */}
          {step === "success" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-lob-green/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lob-green text-xl">{"\u2713"}</span>
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Job Created Successfully
              </p>
              <p className="text-xs text-text-tertiary mb-3">
                {useX402
                  ? `x402 settlement complete. Job #${bridgeJobId ?? "..."} created via bridge.`
                  : "Funds are now held in escrow."}
              </p>
              {jobTxHash && (
                <a
                  href={getExplorerUrl("tx", jobTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lob-green hover:underline"
                >
                  View on BaseScan
                </a>
              )}
              <div className="flex items-center justify-center gap-3 mt-4">
                <Link
                  href="/jobs"
                  className="btn-primary text-xs px-4 py-2"
                >
                  Go to Jobs
                </Link>
                <button
                  onClick={onClose}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {step !== "success" && (
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
              >
                Cancel
              </button>
              {step === "approve" && needsApproval && (
                <motion.button
                  className="btn-primary text-xs px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  whileTap={!tokenNotAllowed ? { scale: 0.97 } : {}}
                  onClick={handleApprove}
                  disabled={loading || waitingApproval || tokenNotAllowed}
                >
                  {loading || waitingApproval
                    ? "Approving..."
                    : useX402
                    ? "Approve USDC"
                    : `Approve ${tokenSymbol}`}
                </motion.button>
              )}
              {(step === "create" || (step === "approve" && !needsApproval)) && (
                <motion.button
                  className="btn-primary text-xs px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  whileTap={!tokenNotAllowed ? { scale: 0.97 } : {}}
                  onClick={step === "approve" ? handleStart : handleCreateJob}
                  disabled={loading || tokenNotAllowed}
                >
                  {loading
                    ? useX402 ? "Settling..." : "Creating Job..."
                    : useX402 ? "Sign & Settle via x402" : "Create Job & Lock Funds"}
                </motion.button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
