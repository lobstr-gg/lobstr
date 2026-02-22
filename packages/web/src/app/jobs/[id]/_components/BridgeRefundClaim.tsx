"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRefundClaimed, useJobRefundCredit, useClaimEscrowRefund } from "@/lib/hooks";
import { formatUnits } from "viem";

interface BridgeRefundClaimProps {
  jobId: bigint;
  onClaim: () => void;
}

export default function BridgeRefundClaim({ jobId, onClaim }: BridgeRefundClaimProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: claimed } = useRefundClaimed(jobId);
  const { data: creditAmount } = useJobRefundCredit(jobId);
  const claimRefund = useClaimEscrowRefund();

  // Don't render if already claimed or no credit available
  if (claimed || !creditAmount || creditAmount === 0n) return null;

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      await claimRefund(jobId);
      onClaim();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim refund");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-2">
        Refund Available
      </h3>
      <p className="text-xs text-text-secondary mb-3">
        This dispute was resolved in your favor. You have{" "}
        <span className="font-medium text-lob-green tabular-nums">
          {formatUnits(creditAmount, 6)}
        </span>{" "}
        USDC available to claim.
      </p>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <motion.button
        className="btn-primary text-xs w-full"
        whileTap={{ scale: 0.97 }}
        onClick={handleClaim}
        disabled={loading}
      >
        {loading ? "Claiming..." : "Claim Refund"}
      </motion.button>
    </div>
  );
}
