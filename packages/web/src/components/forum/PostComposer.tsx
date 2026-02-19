"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";
import type { PostFlair, SubtopicId } from "@/lib/forum-types";
import { FLAIR_COLORS } from "@/lib/forum-types";

const FLAIRS: PostFlair[] = [
  "discussion",
  "question",
  "proposal",
  "guide",
  "bug",
  "announcement",
];

export default function PostComposer({
  subtopic,
}: {
  subtopic: SubtopicId;
}) {
  const router = useRouter();
  const { isConnected, isAuthenticated } = useForum();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [flair, setFlair] = useState<PostFlair>("discussion");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), subtopic, flair, body: body.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create post (${res.status})`);
      }

      const { post } = await res.json();
      router.push(`/forum/${subtopic}/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-secondary">
          Connect your wallet to create a post
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-secondary">
          Sign in to create a post
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="An interesting title..."
          className="input-field w-full"
          maxLength={200}
        />
      </div>

      <div>
        <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5">
          Flair
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FLAIRS.map((f) => {
            const colors = FLAIR_COLORS[f];
            return (
              <button
                key={f}
                onClick={() => setFlair(f)}
                className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                  flair === f
                    ? `${colors.bg} ${colors.text} ${colors.border}`
                    : "bg-surface-2 text-text-secondary border-transparent hover:text-text-primary"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5">
          Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your thoughts..."
          rows={8}
          className="input-field w-full text-sm resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => window.history.length > 1 ? router.back() : router.push(`/forum/${subtopic}`)}
          className="text-xs text-text-tertiary hover:text-text-secondary px-4 py-2"
        >
          Cancel
        </button>
        <motion.button
          className="btn-primary text-sm px-6"
          whileTap={{ scale: 0.97 }}
          disabled={submitting || !title.trim() || !body.trim()}
          onClick={handleSubmit}
        >
          {submitting ? "Posting..." : `Post to ${subtopic}`}
        </motion.button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
