"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import type { Conversation } from "@/lib/forum-types";
import DMInbox from "@/components/forum/DMInbox";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";

export default function MessagesPage() {
  const { currentUser, isConnected } = useForum();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/forum/messages")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => setConversations(data.conversations))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isConnected, currentUser]);

  const handleComposeSend = async () => {
    const to = composeTo.trim();
    const body = composeBody.trim();
    if (!to || !body || composeSending) return;

    setComposeSending(true);
    setComposeError(null);

    try {
      const res = await fetch("/api/forum/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();
      setShowCompose(false);
      setComposeTo("");
      setComposeBody("");
      router.push(`/forum/messages/${data.conversationId}`);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setComposeSending(false);
    }
  };

  if (!isConnected || !currentUser) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb crumbs={[{ label: "Messages" }]} />
        <EmptyState
          title="Connect your wallet"
          subtitle="You need to connect your wallet to view messages"
        />
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-lob-green/30 border-t-lob-green rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="text-sm text-red-400">Failed to load data</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-lob-green mt-2 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp}>
      <ForumBreadcrumb crumbs={[{ label: "Messages" }]} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text-primary">Messages</h1>
        <button
          onClick={() => setShowCompose(true)}
          className="btn-primary text-sm px-3 py-1.5"
        >
          New Message
        </button>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="card p-4 mb-4 border border-lob-green/20">
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            New Message
          </h2>
          <input
            type="text"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            placeholder="Recipient address (0x...)"
            className="input-field w-full text-sm mb-2"
          />
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="Type your message..."
            className="input-field w-full text-sm min-h-[80px] resize-none"
          />
          {composeError && (
            <p className="text-xs text-red-400 mt-1">{composeError}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setShowCompose(false);
                setComposeError(null);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleComposeSend}
              disabled={!composeTo.trim() || !composeBody.trim() || composeSending}
              className="btn-primary text-sm px-3 py-1.5"
            >
              {composeSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      <DMInbox
        conversations={conversations}
        currentUserAddress={currentUser.address}
      />
    </motion.div>
  );
}
