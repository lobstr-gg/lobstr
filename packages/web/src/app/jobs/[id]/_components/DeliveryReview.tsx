"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  useConfirmDeliveryWithHash,
  useInitiateDispute,
  useBridgeConfirmDelivery,
  useBridgeInitiateDispute,
} from "@/lib/hooks";

interface DeliveryFile {
  name: string;
  path: string;
  url?: string;
}

interface DeliveryReviewProps {
  jobId: bigint;
  deliveryMetadataURI: string;
  disputeWindowEnd: number; // unix timestamp in seconds
  onConfirm: () => void;
  isBridgeJob?: boolean;
}

export default function DeliveryReview({
  jobId,
  deliveryMetadataURI,
  disputeWindowEnd,
  onConfirm,
  isBridgeJob = false,
}: DeliveryReviewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [timeLeft, setTimeLeft] = useState("");

  const confirmDeliveryDirect = useConfirmDeliveryWithHash();
  const initiateDisputeDirect = useInitiateDispute();
  const confirmDeliveryBridge = useBridgeConfirmDelivery();
  const initiateDisputeBridge = useBridgeInitiateDispute();

  // Route through bridge for x402 jobs, direct escrow otherwise
  const confirmDelivery = isBridgeJob ? confirmDeliveryBridge : confirmDeliveryDirect;
  const initiateDispute = isBridgeJob
    ? (jobId: bigint, evidenceURI: string) => initiateDisputeBridge(jobId, evidenceURI)
    : initiateDisputeDirect;

  // Parse delivery metadata
  let deliveryData: { files?: DeliveryFile[]; note?: string } = {};
  try {
    deliveryData = JSON.parse(deliveryMetadataURI);
  } catch {
    deliveryData = { note: deliveryMetadataURI };
  }

  // Countdown timer
  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = disputeWindowEnd - now;
      if (remaining <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [disputeWindowEnd]);

  const handleConfirm = async () => {
    if (!confirm("Confirm delivery and release funds to seller?")) return;
    setLoading(true);
    setError(null);
    try {
      await confirmDelivery(jobId);
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      setError("Please provide a reason for the dispute");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const evidenceURI = JSON.stringify({
        reason: disputeReason,
        createdAt: Date.now(),
      });
      await initiateDispute(jobId, evidenceURI);
      setShowDispute(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate dispute");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">
          Review Delivery
        </h3>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-text-tertiary">Dispute window:</span>
          <span className={`font-medium tabular-nums ${
            timeLeft === "Expired" ? "text-red-400" : "text-lob-yellow"
          }`}>
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Delivery files */}
      {deliveryData.files && deliveryData.files.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-text-tertiary mb-2">Delivered Files</p>
          <div className="space-y-1">
            {deliveryData.files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded bg-surface-2 text-xs"
              >
                <span className="text-text-secondary flex-1 truncate">
                  {file.name}
                </span>
                {file.url && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lob-green hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery note */}
      {deliveryData.note && (
        <div className="mb-4">
          <p className="text-xs text-text-tertiary mb-1">Seller Note</p>
          <p className="text-xs text-text-secondary bg-surface-2 rounded p-2">
            {deliveryData.note}
          </p>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      {/* Dispute form */}
      {showDispute ? (
        <div className="mb-4">
          <label className="text-xs text-text-tertiary block mb-1">
            Dispute Reason
          </label>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Describe why you are disputing this delivery..."
            className="w-full bg-surface-2 border border-border rounded p-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-red-400/40 resize-none"
            rows={3}
            maxLength={500}
          />
          <div className="flex items-center gap-2 mt-2">
            <motion.button
              className="text-xs px-3 py-1.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
              whileTap={{ scale: 0.97 }}
              onClick={handleDispute}
              disabled={loading}
            >
              {loading ? "Submitting..." : "Submit Dispute"}
            </motion.button>
            <button
              onClick={() => setShowDispute(false)}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <motion.button
            className="btn-primary flex-1 text-xs"
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Confirming..." : "Confirm & Release Funds"}
          </motion.button>
          <motion.button
            className="text-xs px-3 py-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10"
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowDispute(true)}
            disabled={loading}
          >
            Raise Dispute
          </motion.button>
        </div>
      )}
    </div>
  );
}
