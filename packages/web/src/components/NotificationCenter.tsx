"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useForum } from "@/lib/forum-context";
import type { Notification, NotificationType } from "@/lib/forum-types";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const TYPE_ICONS: Record<NotificationType, string> = {
  forum_reply: "Reply",
  forum_mention: "@",
  dm_received: "DM",
  dispute_update: "Disp",
  dispute_assigned: "Arb",
  dispute_thread_created: "Thread",
  dispute_evidence_deadline: "Evid",
  proposal_update: "Gov",
  mod_action: "Mod",
  system: "Sys",
  friend_request: "Friend",
  channel_message: "Chat",
};

const TYPE_COLORS: Record<NotificationType, string> = {
  forum_reply: "text-blue-400",
  forum_mention: "text-purple-400",
  dm_received: "text-lob-green",
  dispute_update: "text-amber-400",
  dispute_assigned: "text-red-400",
  dispute_thread_created: "text-amber-400",
  dispute_evidence_deadline: "text-red-400",
  proposal_update: "text-cyan-400",
  mod_action: "text-orange-400",
  channel_message: "text-purple-400",
  system: "text-text-secondary",
  friend_request: "text-lob-green",
};

function NotificationItem({
  notification,
  onRead,
  onClose,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const content = (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2 ${
        !notification.read ? "bg-surface-1/80" : ""
      }`}
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        onClose();
      }}
    >
      <div
        className={`text-[9px] font-bold mt-0.5 shrink-0 w-7 text-center ${
          TYPE_COLORS[notification.type]
        }`}
      >
        {TYPE_ICONS[notification.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-text-primary truncate">
            {notification.title}
          </p>
          {!notification.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-lob-green shrink-0" />
          )}
        </div>
        <p className="text-[10px] text-text-tertiary truncate mt-0.5">
          {notification.body}
        </p>
        <p className="text-[9px] text-text-tertiary mt-0.5">
          {timeAgo(notification.createdAt)}
        </p>
      </div>
    </div>
  );

  if (notification.href) {
    return <Link href={notification.href}>{content}</Link>;
  }
  return content;
}

export default function NotificationCenter({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useForum();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <motion.button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded transition-colors ${
          open || pathname?.startsWith("/notifications")
            ? "text-lob-green"
            : "text-text-secondary hover:text-text-primary"
        }`}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Bell icon */}
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unreadNotificationCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
            {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 w-auto sm:w-80 rounded-lg border border-border/60 bg-surface-0/95 glass shadow-2xl z-[60] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
              <p className="text-[10px] text-text-tertiary uppercase tracking-widest font-semibold">
                Notifications
              </p>
              {unreadNotificationCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[10px] text-lob-green hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-text-tertiary">
                    No notifications yet
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markNotificationRead}
                    onClose={() => setOpen(false)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
