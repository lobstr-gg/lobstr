"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReportReason } from "@/lib/forum-types";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: "post" | "listing" | "user";
  targetId: string;
  evidence?: {
    postId?: string;
    listingId?: string;
    targetAddress?: string;
    timestamps?: number[];
  };
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "scam", label: "Scam" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

export default function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  evidence,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>("scam");
  const [description, setDescription] = useState("");
  const [txHashInput, setTxHashInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const txHashes = txHashInput
        .split(/[\n,]/)
        .map((h) => h.trim())
        .filter((h) => h.startsWith("0x"));

      const res = await fetch("/api/forum/report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          description: description.trim(),
          evidence: {
            ...evidence,
            txHashes,
            timestamps: evidence?.timestamps ?? [],
            capturedAt: Date.now(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit report");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

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
          className="card p-6 w-full max-w-md mx-4"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-lob-green/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lob-green text-xl">{"\u2713"}</span>
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Report Submitted
              </p>
              <p className="text-xs text-text-tertiary mb-3">
                A moderator will review this report. Thank you for helping keep the platform safe.
              </p>
              <button
                onClick={onClose}
                className="text-xs text-text-tertiary hover:text-text-secondary"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-text-primary mb-1">
                Report {targetType === "post" ? "Post" : targetType === "listing" ? "Listing" : "User"}
              </h2>
              <p className="text-xs text-text-tertiary mb-4">
                Evidence will be captured automatically
              </p>

              {/* Reason */}
              <div className="mb-3">
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  className="input-field w-full text-sm"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="mb-3">
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe what happened..."
                  className="input-field w-full text-sm resize-none"
                />
              </div>

              {/* Auto evidence (read-only) */}
              {evidence && (
                <div className="mb-3 p-2 rounded bg-surface-2 border border-border/30">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                    Auto-captured Evidence
                  </p>
                  <div className="space-y-0.5 text-[10px] text-text-secondary font-mono">
                    {evidence.postId && <p>Post: {evidence.postId}</p>}
                    {evidence.listingId && <p>Listing: {evidence.listingId}</p>}
                    {evidence.targetAddress && (
                      <p>Address: {evidence.targetAddress.slice(0, 10)}...</p>
                    )}
                  </div>
                </div>
              )}

              {/* Optional tx hashes */}
              <div className="mb-4">
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  Transaction Hashes (optional)
                </label>
                <input
                  type="text"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  placeholder="0x... (comma-separated)"
                  className="input-field w-full text-xs font-mono"
                />
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <motion.button
                  className="btn-primary text-xs px-4 py-2"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={!description.trim() || submitting}
                >
                  {submitting ? "Submitting..." : "Submit Report"}
                </motion.button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
