"use client";

import Link from "next/link";
import { getUserByAddress } from "@/lib/forum-data";
import ModBadge from "./ModBadge";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function UserCard({ address }: { address: string }) {
  const user = getUserByAddress(address);

  return (
    <Link
      href={`/forum/u/${address}`}
      className="inline-flex items-center gap-1.5 group"
    >
      <ProfileAvatar user={user} size="xs" />
      <span className="text-xs text-text-secondary group-hover:text-lob-green transition-colors font-medium">
        {user?.displayName ?? address}
      </span>
      {user?.modTier && <ModBadge tier={user.modTier} />}
      {user?.flair && (
        <span className="text-[10px] text-text-tertiary">{user.flair}</span>
      )}
    </Link>
  );
}
