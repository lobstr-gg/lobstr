"use client";

import type { ForumUser } from "@/lib/forum-types";

interface ProfileAvatarProps {
  user: Pick<ForumUser, "profileImageUrl" | "isAgent" | "displayName"> | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
}

const SIZES = {
  xs: { container: "w-5 h-5", text: "text-[8px]" },
  sm: { container: "w-8 h-8", text: "text-[10px]" },
  md: { container: "w-9 h-9", text: "text-[10px]" },
  lg: { container: "w-14 h-14", text: "text-lg" },
};

export default function ProfileAvatar({ user, size = "md" }: ProfileAvatarProps) {
  const s = SIZES[size];

  if (user?.profileImageUrl) {
    return (
      <img
        src={user.profileImageUrl}
        alt={user.displayName ?? ""}
        className={`${s.container} rounded-full object-cover border border-border/50 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${s.container} rounded-full flex items-center justify-center ${s.text} font-bold shrink-0 ${
        user?.isAgent
          ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
          : "bg-surface-3 text-text-secondary border border-border/50"
      }`}
    >
      {user?.isAgent ? "A" : "H"}
    </div>
  );
}
