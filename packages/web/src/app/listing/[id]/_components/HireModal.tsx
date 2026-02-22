"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, type Address } from "viem";
import { useApproveToken, useCreateJobWithHash, useLOBAllowance, useLOBBalance, useStakeInfo } from "@/lib/hooks";
import { getContracts, CHAIN } from "@/config/contracts";
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

  const { data: allowance, refetch: refetchAllowance } = useLOBAllowance(
    address,
    escrowAddress
  );
  const { data: lobBalance } = useLOBBalance(address);
  const { data: stakeInfo } = useStakeInfo(address);

  const hasInsufficientBalance = lobBalance !== undefined && lobBalance < amount;
  const stakedAmount = stakeInfo ? (stakeInfo as unknown as [bigint, bigint, bigint])[0] : BigInt(0);

  const approveToken = useApproveToken();
  const createJob = useCreateJobWithHash();

  const [step, setStep] = useState<Step>("approve");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Address | undefined>();
  const [jobTxHash, setJobTxHash] = useState<Address | undefined>();

  const { isLoading: waitingApproval } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  const needsApproval = !allowance || allowance < amount;

  const handleApprove = async () => {
    if (!escrowAddress) return;
    setLoading(true);
    setError(null);
    try {
      const hash = await approveToken(token, escrowAddress, amount);
      setTxHash(hash);
      // Wait a bit for the tx to confirm then refetch allowance
      setTimeout(async () => {
        await refetchAllowance();
        setStep("create");
        setLoading(false);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      setLoading(false);
    }
  };

  const handleCreateJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const hash = await createJob(listingId, seller, amount, token);
      setJobTxHash(hash);
      setStep("success");
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

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="card p-6 w-full max-w-md mx-4"
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

          {/* Amount display */}
          <div className="card p-4 mb-4 bg-surface-2/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">Escrow Amount</span>
              <span className="text-lg font-bold text-lob-green tabular-nums">
                {Number(formatEther(amount)).toLocaleString()} {tokenSymbol}
              </span>
            </div>
            <p className="text-[10px] text-text-tertiary mt-1">
              Funds will be held in escrow until delivery is confirmed or dispute is resolved.
            </p>
          </div>

          {/* Insufficient balance warning */}
          {hasInsufficientBalance && stakedAmount > BigInt(0) && (
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

          {/* Steps */}
          <div className="flex items-center gap-2 mb-4">
            {["Approve", "Create Job"].map((label, i) => {
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
                Funds are now held in escrow.
              </p>
              {jobTxHash && (
                <a
                  href={`https://basescan.org/tx/${jobTxHash}`}
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
                  className="btn-primary text-xs px-4 py-2"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleApprove}
                  disabled={loading || waitingApproval}
                >
                  {loading || waitingApproval
                    ? "Approving..."
                    : `Approve ${tokenSymbol}`}
                </motion.button>
              )}
              {(step === "create" || (step === "approve" && !needsApproval)) && (
                <motion.button
                  className="btn-primary text-xs px-4 py-2"
                  whileTap={{ scale: 0.97 }}
                  onClick={step === "approve" ? handleStart : handleCreateJob}
                  disabled={loading}
                >
                  {loading ? "Creating Job..." : "Create Job & Lock Funds"}
                </motion.button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
