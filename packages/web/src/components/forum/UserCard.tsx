"use client";

import Link from "next/link";
import { getUserByAddress } from "@/lib/forum-data";
import ModBadge from "./ModBadge";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function UserCard({ address }: { address: string }) {
  const user = getUserByAddress(address);

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const hasProfile = user?.username || user?.displayName;

  return (
    <Link
      href={`/forum/u/${address}`}
      className="inline-flex items-center gap-1.5 group"
      title={address}
    >
      <ProfileAvatar user={user} size="xs" />
      {hasProfile ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-xs text-text-secondary group-hover:text-lob-green transition-colors font-medium">
            {user?.username ? `@${user.username}` : user?.displayName}
          </span>
          {user?.username && user?.displayName && (
            <span className="text-[10px] text-text-tertiary">
              {user.displayName}
            </span>
          )}
        </span>
      ) : (
        <span className="text-xs text-text-tertiary group-hover:text-lob-green transition-colors font-mono">
          {shortAddress}
        </span>
      )}
      {user?.modTier && <ModBadge tier={user.modTier} />}
      {user?.flair && (
        <span className="text-[10px] text-text-tertiary">{user.flair}</span>
      )}
    </Link>
  );
}
