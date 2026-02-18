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

  // Mod team DM state
  const [showModContact, setShowModContact] = useState(false);
  const [modSubject, setModSubject] = useState("");
  const [modBody, setModBody] = useState("");
  const [modSending, setModSending] = useState(false);
  const [modError, setModError] = useState<string | null>(null);

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

  const handleModTeamSend = async () => {
    const body = modBody.trim();
    if (!body || modSending) return;

    setModSending(true);
    setModError(null);

    try {
      const res = await fetch("/api/forum/messages/mod-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: modSubject.trim(), body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();
      setShowModContact(false);
      setModSubject("");
      setModBody("");
      router.push(`/forum/messages/${data.conversationId}`);
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setModSending(false);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowModContact(true); setShowCompose(false); }}
            className="text-sm px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Contact Mod Team
          </button>
          <button
            onClick={() => { setShowCompose(true); setShowModContact(false); }}
            className="btn-primary text-sm px-3 py-1.5"
          >
            New Message
          </button>
        </div>
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

      {/* Mod team contact form */}
      {showModContact && (
        <div className="card p-4 mb-4 border border-amber-500/20">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Contact Mod Team
          </h2>
          <p className="text-[11px] text-text-tertiary mb-3">
            Your message will be assigned to an available moderator who will respond in this thread.
          </p>
          <input
            type="text"
            value={modSubject}
            onChange={(e) => setModSubject(e.target.value)}
            placeholder="Subject (optional) — e.g., Report inappropriate content"
            className="input-field w-full text-sm mb-2"
          />
          <textarea
            value={modBody}
            onChange={(e) => setModBody(e.target.value)}
            placeholder="Describe what you need help with..."
            className="input-field w-full text-sm min-h-[80px] resize-none"
          />
          {modError && (
            <p className="text-xs text-red-400 mt-1">{modError}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setShowModContact(false);
                setModError(null);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleModTeamSend}
              disabled={!modBody.trim() || modSending}
              className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {modSending ? "Sending..." : "Send to Mod Team"}
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
