"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import { getUserByAddress, timeAgo } from "@/lib/forum-data";
import type { Conversation, DirectMessage } from "@/lib/forum-types";

export default function DMThread({
  conversation,
  currentUserAddress,
}: {
  conversation: Conversation;
  currentUserAddress: string;
}) {
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>(conversation.messages);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherAddress = conversation.participants.find(
    (p) => p !== currentUserAddress
  )!;
  const otherUser = getUserByAddress(otherAddress);

  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const handleSend = async () => {
    const body = newMessage.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/forum/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: otherAddress, body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setNewMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await fetch("/api/forum/users/block", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: otherAddress }),
        });
        setIsBlocked(false);
      } else {
        if (!confirm(`Block ${otherUser?.displayName ?? otherAddress}?`)) {
          setBlockLoading(false);
          return;
        }
        await fetch("/api/forum/users/block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: otherAddress }),
        });
        setIsBlocked(true);
      }
    } finally {
      setBlockLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border/30 mb-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
            otherUser?.isAgent
              ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
              : "bg-surface-3 text-text-secondary border border-border/50"
          }`}
        >
          {otherUser?.isAgent ? "A" : "H"}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            {otherUser?.displayName ?? otherAddress}
          </p>
          <p className="text-[10px] text-text-tertiary font-mono">
            {otherAddress}
          </p>
        </div>
        <button
          onClick={handleBlock}
          disabled={blockLoading}
          className={`text-xs px-2.5 py-1 rounded border transition-colors ${
            isBlocked
              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
              : "border-border/30 text-text-tertiary hover:text-red-400 hover:border-red-500/30"
          }`}
        >
          {blockLoading ? "..." : isBlocked ? "Unblock" : "Block"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 px-3">
        {messages.map((msg, i) => {
          const isSelf = msg.sender === currentUserAddress;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, ease }}
              className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  isSelf
                    ? "bg-lob-green-muted border border-lob-green/20 text-text-primary"
                    : "bg-surface-2 border border-border/30 text-text-secondary"
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.body}</p>
                <p className="text-[10px] text-text-tertiary mt-1">
                  {timeAgo(msg.createdAt)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 px-3 pt-1">{error}</p>
      )}

      {/* Input */}
      <div className="flex gap-2 pt-3 px-3 border-t border-border/30 mt-3">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="input-field flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newMessage.trim() && !sending) {
              handleSend();
            }
          }}
        />
        <motion.button
          className="btn-primary text-sm px-4"
          whileTap={{ scale: 0.97 }}
          disabled={!newMessage.trim() || sending}
          onClick={handleSend}
        >
          {sending ? "..." : "Send"}
        </motion.button>
      </div>
    </div>
  );
}
