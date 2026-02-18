"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { ForumUser, Notification } from "./forum-types";

interface ForumContextValue {
  currentUser: ForumUser | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  needsProfileSetup: boolean;
  dismissProfileSetup: () => void;
  updateCurrentUser: (updates: Partial<ForumUser>) => void;
  votes: Record<string, 1 | -1>;
  vote: (id: string, direction: 1 | -1) => void;
  unreadDMCount: number;
  notifications: Notification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const ForumContext = createContext<ForumContextValue>({
  currentUser: null,
  isConnected: false,
  isAuthenticated: false,
  needsProfileSetup: false,
  dismissProfileSetup: () => {},
  updateCurrentUser: () => {},
  votes: {},
  vote: () => {},
  unreadDMCount: 0,
  notifications: [],
  unreadNotificationCount: 0,
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
  searchQuery: "",
  setSearchQuery: () => {},
});

async function authenticate(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<string>
): Promise<boolean> {
  try {
    // 1. Get challenge nonce
    const challengeRes = await fetch(
      `/api/forum/auth/challenge?address=${address}`,
      { credentials: "include" }
    );
    if (!challengeRes.ok) return false;
    const { nonce } = await challengeRes.json();

    // 2. Sign the message
    const message = `LOBSTR Forum\nNonce: ${nonce}\nAddress: ${address}`;
    const signature = await signMessageAsync({ message });

    // 3. Register / login
    const registerRes = await fetch("/api/forum/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, nonce }),
    });
    return registerRes.ok;
  } catch {
    return false;
  }
}

export function ForumProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<ForumUser | null>(null);
  const [unreadDMCount, setUnreadDMCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const authAttempted = useRef<string | null>(null);

  // Fetch user profile and related data (called after auth succeeds)
  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch("/api/forum/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;

      const data = await res.json();
      if (data?.user) {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        const user = data.user as ForumUser;
        const isDefault =
          user.displayName.endsWith("...") && !user.profileImageUrl;
        setNeedsProfileSetup(isDefault);
      }

      // Fetch unread DMs
      fetch("/api/forum/messages", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.conversations) {
            const total = d.conversations.reduce(
              (sum: number, c: { unreadCount?: number }) =>
                sum + (c.unreadCount || 0),
              0
            );
            setUnreadDMCount(total);
          }
        })
        .catch(() => {});

      // Fetch notifications
      fetch("/api/forum/notifications", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.notifications) {
            setNotifications(d.notifications);
          }
        })
        .catch(() => {});

      return true;
    } catch {
      return false;
    }
  }, []);

  // Auth + profile flow on wallet connection
  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setUnreadDMCount(0);
      setNotifications([]);
      setNeedsProfileSetup(false);
      setSetupDismissed(false);
      authAttempted.current = null;
      return;
    }

    // Prevent duplicate auth attempts for the same address
    if (authAttempted.current === address) return;
    authAttempted.current = address;

    // Try existing cookie first
    fetchUserData().then((success) => {
      if (success) return;

      // No valid cookie — trigger SIWE auth flow
      authenticate(address, signMessageAsync).then((authed) => {
        if (authed) {
          fetchUserData();
        }
      });
    });
  }, [isConnected, address, signMessageAsync, fetchUserData]);

  // Poll for new notifications every 60 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      fetch("/api/forum/notifications", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.notifications) setNotifications(d.notifications);
        })
        .catch(() => {});

      // Also refresh DM count
      fetch("/api/forum/messages", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.conversations) {
            const total = d.conversations.reduce(
              (sum: number, c: { unreadCount?: number }) =>
                sum + (c.unreadCount || 0),
              0
            );
            setUnreadDMCount(total);
          }
        })
        .catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const vote = useCallback((id: string, direction: 1 | -1) => {
    setVotes((prev) => {
      if (prev[id] === direction) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: direction };
    });
  }, []);

  const dismissProfileSetup = useCallback(() => {
    setSetupDismissed(true);
    setNeedsProfileSetup(false);
  }, []);

  const updateCurrentUser = useCallback((updates: Partial<ForumUser>) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev));
    setNeedsProfileSetup(false);
  }, []);

  const markNotificationRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      fetch(`/api/forum/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    },
    []
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch("/api/forum/notifications/read-all", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  return (
    <ForumContext.Provider
      value={{
        currentUser,
        isConnected: !!isConnected,
        isAuthenticated,
        needsProfileSetup: needsProfileSetup && !setupDismissed,
        dismissProfileSetup,
        updateCurrentUser,
        votes,
        vote,
        unreadDMCount,
        notifications,
        unreadNotificationCount,
        markNotificationRead,
        markAllNotificationsRead,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </ForumContext.Provider>
  );
}

export function useForum() {
  return useContext(ForumContext);
}
