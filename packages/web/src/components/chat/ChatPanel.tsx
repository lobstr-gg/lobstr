"use client";

import { useEffect, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";

interface ChatPanelProps {
  pathname: string;
  onClose: () => void;
}

export function ChatPanel({ pathname, onClose }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { pageContext: pathname },
      }),
    [pathname]
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const showTyping =
    status === "submitted" &&
    (messages.length === 0 || messages[messages.length - 1].role !== "assistant");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed bottom-20 right-6 z-50 flex w-80 sm:w-96 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-0 shadow-2xl shadow-black/40"
      style={{ height: "28rem" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-lob-green breathe" />
          <span className="text-sm font-semibold text-text-primary">LOBSTR Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-secondary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <span className="text-2xl mb-2">🦞</span>
            <p className="text-sm font-medium text-text-secondary">
              Hey! Ask me anything about LOBSTR.
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Staking, disputes, governance, airdrop — I got you.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {showTyping && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        isLoading={isLoading}
      />
    </motion.div>
  );
}
