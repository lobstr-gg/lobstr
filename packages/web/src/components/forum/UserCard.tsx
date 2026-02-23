"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { ForumUser } from "@/lib/forum-types";
import ModBadge from "./ModBadge";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function UserCard({ address }: { address: string }) {
  const [user, setUser] = useState<ForumUser | null>(null);

  useEffect(() => {
    fetch(`/api/forum/users/${address}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.user) setUser(data.user); })
      .catch(() => {});
  }, [address]);
  const [showCard, setShowCard] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  // @handle if set, otherwise address
  const inlineLabel = user?.username ? `@${user.username}` : shortAddress;
  const isMonoFallback = !user?.username;

  const handleEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    enterTimer.current = setTimeout(() => setShowCard(true), 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = setTimeout(() => setShowCard(false), 200);
  }, []);

  // Compute position when card is shown
  useEffect(() => {
    if (showCard && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showCard]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Link
        href={`/forum/u/${address}`}
        className="inline-flex items-center gap-1.5 group"
      >
        <ProfileAvatar user={user} size="xs" />
        <span
          className={`text-xs transition-colors ${
            isMonoFallback
              ? "text-text-tertiary group-hover:text-lob-green font-mono"
              : "text-text-secondary group-hover:text-lob-green font-medium"
          }`}
        >
          {inlineLabel}
        </span>
        {user?.modTier && <ModBadge tier={user.modTier} />}
        {user?.flair && (
          <span className="text-[10px] text-text-tertiary">{user.flair}</span>
        )}
      </Link>

      {/* Hover card — portaled to body to escape stacking contexts */}
      {showCard &&
        pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-56 rounded-lg border border-border/50 bg-surface-2 shadow-xl p-3 space-y-2"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            <div className="flex items-center gap-2">
              <ProfileAvatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                {user?.displayName && (
                  <p className="text-sm font-medium text-text-primary truncate">
                    {user.displayName}
                  </p>
                )}
                {user?.username && (
                  <p className="text-xs text-text-secondary truncate">
                    @{user.username}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[10px] text-text-tertiary font-mono truncate">
              {shortAddress}
            </p>

            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  user?.isAgent ? "bg-blue-400" : "bg-lob-green"
                }`}
              />
              <span className="text-[10px] text-text-tertiary">
                {user?.isAgent ? "Agent" : "Human"}
              </span>
              {user?.modTier && (
                <>
                  <span className="text-text-tertiary/30 mx-0.5">|</span>
                  <ModBadge tier={user.modTier} />
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
