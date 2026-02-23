"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { ease } from "@/lib/motion";

interface ChatMessage {
  id: string;
  channelId: string;
  sender: string;
  senderLabel?: string;
  body: string;
  createdAt: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ChannelChat({ channelId }: { channelId: string }) {
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/forum/channels/${channelId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          setError("Access denied");
          return;
        }
        throw new Error("Failed to load");
      }
      const data = await res.json();
      setMessages(data.messages ?? []);

      // Fetch display names for senders we haven't seen
      const senders = new Set(
        (data.messages ?? []).map((m: ChatMessage) => m.sender)
      );
      const missing = [...senders].filter(
        (s) => !userLabels[s as string]
      ) as string[];
      if (missing.length > 0) {
        const labels: Record<string, string> = { ...userLabels };
        await Promise.all(
          missing.map(async (addr) => {
            try {
              const r = await fetch(`/api/forum/users/${addr}`);
              if (r.ok) {
                const u = await r.json();
                labels[addr] =
                  u.user?.displayName ?? truncateAddress(addr);
              } else {
                labels[addr] = truncateAddress(addr);
              }
            } catch {
              labels[addr] = truncateAddress(addr);
            }
          })
        );
        setUserLabels(labels);
      }

      setError(null);
    } catch {
      // Don't overwrite existing error for poll failures
      if (messages.length === 0) setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/forum/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ body }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }
      setDraft("");
      // Immediately refresh
      await fetchMessages();
    } catch (err) {
      setError((err as Error).message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="card p-3 sm:p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-text-tertiary animate-spin" />
        </div>
      </div>
    );
  }

  if (error === "Access denied") {
    return (
      <div className="card p-3 sm:p-5 text-center py-8">
        <p className="text-sm text-text-secondary">Access denied</p>
        <p className="text-xs text-text-tertiary mt-1">
          You don&apos;t have permission to view this channel.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" />
          {channelId === "mod-channel"
            ? "Mod Coordination Channel"
            : "Arbitrator Chat"}
        </h3>
        <span className="text-[10px] text-text-tertiary">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-6">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((msg, i) => {
            const label =
              userLabels[msg.sender] ?? truncateAddress(msg.sender);
            const isOwn =
              address?.toLowerCase() === msg.sender.toLowerCase();

            return (
              <motion.div
                key={msg.id}
                className="flex items-start gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <div className="w-7 h-7 rounded-full bg-surface-3 border border-border/60 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-text-secondary">
                    {label.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-xs font-semibold ${
                        isOwn ? "text-lob-green" : "text-text-primary"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono">
                      {truncateAddress(msg.sender)}
                    </span>
                    <span className="text-[10px] text-text-tertiary tabular-nums">
                      {timeAgo(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {msg.body}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Error banner */}
      {error && error !== "Access denied" && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      {/* Compose */}
      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
          disabled={sending}
        />
        <motion.button
          className="w-8 h-8 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center text-lob-green hover:bg-lob-green/20 transition-colors disabled:opacity-40"
          whileTap={{ scale: 0.95 }}
          disabled={!draft.trim() || sending}
          onClick={handleSend}
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
