"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";

interface ReviewFormProps {
  jobId: string;
  revieweeAddress: string;
  role: "buyer" | "seller";
  onSuccess: () => void;
}

export default function ReviewForm({ jobId, revieweeAddress, role, onSuccess }: ReviewFormProps) {
  const { address } = useAccount();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!address || rating === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/forum/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobId,
          revieweeAddress,
          role,
          rating,
          body: body.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit review");
      }

      setSubmitted(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="card p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-lob-green/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-lob-green text-lg">{"\u2713"}</span>
        </div>
        <p className="text-sm text-text-secondary">Review Submitted</p>
        <p className="text-xs text-text-tertiary mt-1">
          Thanks for your feedback!
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">
        Leave a Review
      </h3>
      <p className="text-xs text-text-tertiary mb-4">
        Rate your experience with the {role === "buyer" ? "seller" : "buyer"}
      </p>

      {/* Star rating */}
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
            className="text-xl transition-colors"
          >
            <span className={(hoverRating || rating) >= star ? "text-yellow-400" : "text-surface-3"}>
              {"\u2605"}
            </span>
          </button>
        ))}
        {rating > 0 && (
          <span className="text-xs text-text-tertiary ml-2 self-center">
            {rating}/5
          </span>
        )}
      </div>

      {/* Review body */}
      <div className="mb-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your experience..."
          className="w-full bg-surface-2 border border-border rounded p-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
          rows={3}
          maxLength={2000}
        />
        <p className="text-[10px] text-text-tertiary text-right mt-0.5">
          {body.length}/2000
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <motion.button
        className="btn-primary w-full text-xs"
        whileTap={rating > 0 && !submitting ? { scale: 0.97 } : {}}
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </motion.button>
    </div>
  );
}
