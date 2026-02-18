"use client";

import Link from "next/link";
import { getUserByAddress } from "@/lib/forum-data";
import ModBadge from "./ModBadge";

export default function UserCard({ address }: { address: string }) {
  const user = getUserByAddress(address);

  return (
    <Link
      href={`/forum/u/${address}`}
      className="inline-flex items-center gap-1.5 group"
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
          user?.isAgent
            ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
            : "bg-surface-3 text-text-secondary border border-border/50"
        }`}
      >
        {user?.isAgent ? "A" : "H"}
      </div>
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
