"use client";

import { motion } from "framer-motion";
import type { UIMessage } from "ai";

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (!text) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-lob-green text-black rounded-br-sm"
            : "bg-surface-2 text-text-primary rounded-bl-sm"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{text}</div>
      </div>
    </motion.div>
  );
}
