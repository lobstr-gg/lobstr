"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import { getUserByAddress, timeAgo } from "@/lib/forum-data";
import type { Conversation } from "@/lib/forum-types";

export default function DMInbox({
  conversations,
  currentUserAddress,
}: {
  conversations: Conversation[];
  currentUserAddress: string;
}) {
  if (conversations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-secondary">No messages yet</p>
        <p className="text-xs text-text-tertiary mt-1">
          Start a conversation from a user&apos;s profile
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {conversations
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .map((conv, i) => {
          const otherAddress = conv.participants.find(
            (p) => p !== currentUserAddress
          )!;
          const otherUser = getUserByAddress(otherAddress);
          const lastMsg = conv.messages[conv.messages.length - 1];

          return (
            <motion.div
              key={conv.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, ease }}
            >
              <Link
                href={`/forum/messages/${conv.id}`}
                className={`flex items-center gap-3 p-3 rounded border transition-colors hover:bg-surface-1 ${
                  conv.unreadCount > 0
                    ? "border-lob-green/20 bg-lob-green-muted/30"
                    : "border-border/30"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    otherUser?.isAgent
                      ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                      : "bg-surface-3 text-text-secondary border border-border/50"
                  }`}
                >
                  {otherUser?.isAgent ? "A" : "H"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">
                      {otherUser?.displayName ?? otherAddress}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {timeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary truncate mt-0.5">
                    {lastMsg.sender === currentUserAddress ? "You: " : ""}
                    {lastMsg.body}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-lob-green text-black text-[10px] font-bold flex items-center justify-center shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </Link>
            </motion.div>
          );
        })}
    </div>
  );
}
