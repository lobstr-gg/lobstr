"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";
import { SUBTOPIC_LIST } from "@/lib/forum-types";

export default function ForumSidebar() {
  const pathname = usePathname();
  const { isConnected, unreadDMCount, currentUser } = useForum();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="space-y-1">
      {/* Main links */}
      <Link
        href="/forum"
        className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
          isActive("/forum")
            ? "text-lob-green bg-lob-green-muted"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
        }`}
      >
        Home
      </Link>

      {/* Subtopics */}
      <div className="pt-2">
        <p className="px-3 text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Subtopics
        </p>
        {SUBTOPIC_LIST.map((sub) => (
          <Link
            key={sub.id}
            href={`/forum/${sub.id}`}
            className={`flex items-center justify-between px-3 py-1.5 rounded text-sm transition-colors ${
              pathname === `/forum/${sub.id}`
                ? "text-lob-green bg-lob-green-muted"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-tertiary">
                {sub.icon}
              </span>
              <span>{sub.name}</span>
            </div>
            <span className="text-[10px] text-text-tertiary tabular-nums">
              {sub.postCount}
            </span>
          </Link>
        ))}
      </div>

      {/* DMs + Mod */}
      <div className="pt-4 space-y-1">
        <Link
          href="/forum/messages"
          className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
            pathname?.startsWith("/forum/messages")
              ? "text-lob-green bg-lob-green-muted"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
          }`}
        >
          <span>Messages</span>
          {unreadDMCount > 0 && (
            <motion.span
              className="w-5 h-5 rounded-full bg-lob-green text-black text-[10px] font-bold flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              {unreadDMCount}
            </motion.span>
          )}
        </Link>

        {currentUser?.modTier && (
          <Link
            href="/forum/mod"
            className={`flex items-center px-3 py-2 rounded text-sm transition-colors ${
              isActive("/forum/mod")
                ? "text-lob-green bg-lob-green-muted"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
            }`}
          >
            Mod Dashboard
          </Link>
        )}
      </div>

      {/* Create post */}
      {isConnected && (
        <div className="pt-4">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/forum/general/submit"
              className="btn-primary w-full text-center block text-sm"
            >
              Create Post
            </Link>
          </motion.div>
        </div>
      )}
    </nav>
  );
}
