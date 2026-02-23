"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { scaleIn } from "@/lib/motion";
import { ServiceRegistryABI } from "@/config/abis";
import { getContracts, CHAIN } from "@/config/contracts";
import { TASK_CATEGORIES, LOCATION_REGIONS, type TaskCategory, type RegionCode } from "../_data/types";

export default function TaskPostModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const contracts = getContracts(CHAIN.id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("Errands & Delivery");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [preferredRegion, setPreferredRegion] = useState<RegionCode>("all");
  const [deadline, setDeadline] = useState("");

  // Contract write hook for ServiceRegistry.createListing
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const txError = writeError || confirmError;

  // PHYSICAL_TASK = 9 in the ServiceCategory enum
  const PHYSICAL_TASK_CATEGORY = 9;

  // Close modal and reset form on success
  useEffect(() => {
    if (isSuccess) {
      const timeout = setTimeout(() => {
        onClose();
        setTitle("");
        setDescription("");
        setBudget("");
        setLocation("");
        setPreferredRegion("all");
        setDeadline("");
        resetWrite();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, onClose, resetWrite]);

  // Compute deadline as delivery seconds
  function getDeliverySeconds(): bigint {
    if (!deadline) return BigInt(604800); // default 7 days
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    if (diffMs <= 0) return BigInt(86400); // minimum 1 day
    return BigInt(Math.ceil(diffMs / 1000));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contracts) return;
    resetWrite();

    const priceWei = parseEther(budget);
    const deliverySeconds = getDeliverySeconds();

    // Build metadata with location and deadline info
    const metadata = JSON.stringify({
      location,
      preferredRegion,
      deadline,
      taskCategory: category,
    });

    writeContract({
      address: contracts.serviceRegistry,
      abi: ServiceRegistryABI,
      functionName: "createListing",
      args: [
        PHYSICAL_TASK_CATEGORY,   // uint8 — PHYSICAL_TASK = 9
        title,
        description,
        priceWei,
        contracts.lobToken,       // settlement token (LOB)
        deliverySeconds,
        metadata,                 // metadataURI
      ],
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-surface-0/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md card p-4 sm:p-6 bg-surface-1 border border-border max-h-[calc(100vh-2rem)] overflow-y-auto"
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary">
                Post a Task
              </h2>
              <button
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-2 text-lg"
                aria-label="Close task post modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g., Pick up package from FedEx"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                />
              </div>

              <div>
                <label className="text-xs text-text-secondary block mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={3}
                  placeholder="Describe the task in detail..."
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as TaskCategory)
                    }
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-lob-green/40"
                  >
                    {TASK_CATEGORIES.map(({ label }) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Budget (LOB)
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    required
                    min={1}
                    placeholder="100"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    placeholder="City, Country"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                  />
                </div>

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Preferred Region
                  </label>
                  <select
                    value={preferredRegion}
                    onChange={(e) =>
                      setPreferredRegion(e.target.value as RegionCode)
                    }
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-lob-green/40"
                  >
                    {LOCATION_REGIONS.map(({ label, code }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-text-secondary block mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-lob-green/40"
                />
              </div>

              {/* Error message */}
              {txError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 mt-2">
                  {(txError as Error).message?.slice(0, 200) || "Transaction failed"}
                </div>
              )}

              {/* Success message */}
              {isSuccess && (
                <div className="rounded-md border border-lob-green/30 bg-lob-green/10 px-3 py-2 text-xs text-lob-green mt-2">
                  Task posted on-chain!
                  {txHash && (
                    <span className="block mt-1 font-mono text-[10px] text-text-tertiary break-all">
                      Tx: {txHash}
                    </span>
                  )}
                </div>
              )}

              <motion.button
                type="submit"
                className="w-full btn-primary mt-2"
                disabled={isPending || isConfirming || isSuccess}
                whileHover={!isPending && !isConfirming ? { scale: 1.02 } : {}}
                whileTap={!isPending && !isConfirming ? { scale: 0.97 } : {}}
              >
                {isPending
                  ? "Submitting..."
                  : isConfirming
                  ? "Confirming..."
                  : isSuccess
                  ? "Posted"
                  : "Post Task"}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
