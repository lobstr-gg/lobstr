"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { getUserByAddress } from "@/lib/forum-data";
import ModBadge from "./ModBadge";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function UserCard({ address }: { address: string }) {
  const user = getUserByAddress(address);
  const [showCard, setShowCard] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  // Priority: @username > displayName > shortened address
  const inlineLabel = user?.username
    ? `@${user.username}`
    : user?.displayName
    ? user.displayName
    : shortAddress;
  const isMonoFallback = !user?.username && !user?.displayName;

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

  return (
    <span
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

      {/* Hover card */}
      {showCard && (
        <div
          className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border/50 bg-surface-2 shadow-lg p-3 space-y-2"
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
        </div>
      )}
    </span>
  );
}
