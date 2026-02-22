"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";

export default function CommentComposer({
  onCancel,
  onSubmit,
  loading,
  error,
}: {
  onCancel?: () => void;
  onSubmit?: (body: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const { isConnected } = useForum();
  const [body, setBody] = useState("");

  if (!isConnected) {
    return (
      <div className="p-3 rounded border border-border/30 bg-surface-2 text-center">
        <p className="text-xs text-text-tertiary">
          Connect your wallet to comment
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="input-field w-full text-sm resize-none"
        disabled={loading}
      />
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1"
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <motion.button
          onClick={() => {
            if (!body.trim() || loading) return;
            onSubmit?.(body);
            setBody("");
          }}
          className="btn-primary text-xs px-4 py-1"
          whileTap={{ scale: 0.97 }}
          disabled={!body.trim() || loading}
        >
          {loading ? "Posting..." : "Comment"}
        </motion.button>
      </div>
    </div>
  );
}
