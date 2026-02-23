"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, keccak256, toHex, type Address } from "viem";
import { getContracts, CHAIN, getExplorerUrl } from "@/config/contracts";
import { type SkillListing, formatSkillPrice } from "@/lib/useSkills";
import { useUpdateSkill } from "@/lib/hooks";

interface EditSkillModalProps {
  open: boolean;
  onClose: () => void;
  skill: SkillListing;
  onUpdated?: () => void;
}

export default function EditSkillModal({
  open,
  onClose,
  skill,
  onUpdated,
}: EditSkillModalProps) {
  const contracts = getContracts(CHAIN.id);
  const updateSkill = useUpdateSkill();

  const currentPrice = formatEther(skill.price);

  const [newPrice, setNewPrice] = useState(currentPrice);
  const [newMetadataURI, setNewMetadataURI] = useState(skill.metadataURI);
  const [newApiEndpoint, setNewApiEndpoint] = useState("");
  const [newPackageHash, setNewPackageHash] = useState<string>(skill.packageHash);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Address | undefined>();
  const [success, setSuccess] = useState(false);

  const { isLoading: waitingTx, isSuccess: txConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      query: { enabled: !!txHash },
    });

  // Auto-advance on confirmation
  if (txConfirmed && !success) {
    setSuccess(true);
    onUpdated?.();
  }

  const handleSubmit = async () => {
    setError(null);

    try {
      // Hash the API endpoint URL if provided; otherwise keep existing hash
      const apiEndpointHash: `0x${string}` = newApiEndpoint
        ? keccak256(toHex(newApiEndpoint))
        : skill.apiEndpointHash;

      const hash = await updateSkill.fn(
        skill.id,
        parseEther(newPrice || "0"),
        newMetadataURI,
        apiEndpointHash,
        newPackageHash as `0x${string}`,
      );

      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleClose = () => {
    // Reset state on close
    setError(null);
    setTxHash(undefined);
    setSuccess(false);
    setNewPrice(currentPrice);
    setNewMetadataURI(skill.metadataURI);
    setNewApiEndpoint("");
    setNewPackageHash(skill.packageHash);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="card p-4 sm:p-6 w-full max-w-md mx-4 max-h-[calc(100vh-2rem)] overflow-y-auto relative"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
          >
            {"\u00D7"}
          </button>

          <h2 className="text-lg font-bold text-text-primary mb-1">
            Edit Skill
          </h2>
          <p className="text-xs text-text-tertiary mb-5 line-clamp-1">
            {skill.title} (#{skill.id.toString()})
          </p>

          {/* Success state */}
          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-lob-green/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lob-green text-xl">{"\u2713"}</span>
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Skill Updated
              </p>
              <p className="text-xs text-text-tertiary mb-3">
                Changes have been saved on-chain.
              </p>
              {txHash && (
                <a
                  href={getExplorerUrl("tx", txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lob-green hover:underline"
                >
                  View on BaseScan
                </a>
              )}
              <button
                onClick={handleClose}
                className="block mx-auto mt-3 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Form fields */}
              <div className="space-y-4">
                {/* Price */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider block">
                    Price (LOB)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="input-field"
                    placeholder="0.0"
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    Current: {formatSkillPrice(skill.price, skill.settlementToken, contracts?.lobToken)}
                  </p>
                </div>

                {/* Metadata URI */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider block">
                    Metadata URI
                  </label>
                  <input
                    type="text"
                    value={newMetadataURI}
                    onChange={(e) => setNewMetadataURI(e.target.value)}
                    className="input-field"
                    placeholder="ipfs://... or https://..."
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    Link to JSON metadata (description, docs, etc.)
                  </p>
                </div>

                {/* API Endpoint */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider block">
                    API Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={newApiEndpoint}
                    onChange={(e) => setNewApiEndpoint(e.target.value)}
                    className="input-field"
                    placeholder="https://api.example.com/skill"
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    Leave empty to keep the current endpoint hash. The URL is hashed before being stored on-chain.
                  </p>
                </div>

                {/* Package Hash */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider block">
                    Package Hash
                  </label>
                  <input
                    type="text"
                    value={newPackageHash}
                    onChange={(e) => setNewPackageHash(e.target.value)}
                    className="input-field font-mono text-xs"
                    placeholder="0x..."
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    Keccak256 hash of the code package (for verification).
                  </p>
                </div>
              </div>

              {/* Error display */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-3"
                  >
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
                      {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Waiting for tx */}
              {waitingTx && (
                <div className="mt-3 text-center">
                  <p className="text-xs text-text-tertiary">
                    Waiting for confirmation...
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 mt-5">
                <button
                  onClick={handleClose}
                  className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <motion.button
                  className="btn-primary text-xs px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={updateSkill.isPending || waitingTx}
                >
                  {updateSkill.isPending || waitingTx
                    ? "Updating..."
                    : "Update Skill"}
                </motion.button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
