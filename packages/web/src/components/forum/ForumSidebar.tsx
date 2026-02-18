"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";
import { SUBTOPIC_LIST } from "@/lib/forum-types";

export default function ForumSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const { isConnected, unreadDMCount, currentUser } = useForum();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="space-y-1">
      {/* Main links */}
      <Link
        href="/forum"
        onClick={onNavigate}
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
            onClick={onNavigate}
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
            {sub.postCount > 0 && (
              <span className="text-[10px] text-text-tertiary tabular-nums">
                {sub.postCount}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* DMs + Mod */}
      <div className="pt-4 space-y-1">
        <Link
          href="/forum/messages"
          onClick={onNavigate}
          className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            pathname?.startsWith("/forum/messages")
              ? "text-lob-green bg-lob-green-muted border border-lob-green/30"
              : "text-text-primary hover:text-lob-green bg-surface-2 border border-border/50 hover:border-lob-green/20"
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <span>Messages</span>
          </div>
          {unreadDMCount > 0 && (
            <motion.span
              className="min-w-[20px] h-5 rounded-full bg-lob-green text-black text-[10px] font-bold flex items-center justify-center px-1.5"
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
            onClick={onNavigate}
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
              onClick={onNavigate}
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
