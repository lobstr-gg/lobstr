"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";

export default function CommentComposer({
  onCancel,
  onSubmit,
}: {
  onCancel?: () => void;
  onSubmit?: (body: string) => void;
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
      />
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1"
          >
            Cancel
          </button>
        )}
        <motion.button
          onClick={() => {
            const text = body;
            onSubmit?.(text);
            setBody("");
          }}
          className="btn-primary text-xs px-4 py-1"
          whileTap={{ scale: 0.97 }}
          disabled={!body.trim()}
        >
          Comment
        </motion.button>
      </div>
    </div>
  );
}
