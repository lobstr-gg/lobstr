"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { ForumUser, Notification } from "./forum-types";

interface ForumContextValue {
  currentUser: ForumUser | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  retryAuth: () => void;
  needsProfileSetup: boolean;
  dismissProfileSetup: () => void;
  updateCurrentUser: (updates: Partial<ForumUser>) => void;
  votes: Record<string, 1 | -1>;
  vote: (id: string, direction: 1 | -1) => Promise<void>;
  unreadDMCount: number;
  notifications: Notification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  pendingFriendRequestCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const ForumContext = createContext<ForumContextValue>({
  currentUser: null,
  isConnected: false,
  isAuthenticated: false,
  authLoading: false,
  authError: null,
  retryAuth: () => {},
  needsProfileSetup: false,
  dismissProfileSetup: () => {},
  updateCurrentUser: () => {},
  votes: {},
  vote: async () => {},
  unreadDMCount: 0,
  notifications: [],
  unreadNotificationCount: 0,
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
  pendingFriendRequestCount: 0,
  searchQuery: "",
  setSearchQuery: () => {},
});

async function authenticate(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<string>
): Promise<ForumUser> {
  // 1. Get challenge nonce
  const challengeRes = await fetch(
    `/api/forum/auth/challenge?address=${address}`,
    { credentials: "include" }
  );
  if (!challengeRes.ok) {
    const err = await challengeRes.text().catch(() => "");
    throw new Error(`Challenge failed (${challengeRes.status}): ${err}`);
  }
  const { nonce } = await challengeRes.json();

  // 2. Sign the message
  const message = `LOBSTR Forum\nNonce: ${nonce}\nAddress: ${address}`;
  const signature = await signMessageAsync({ message });

  // 3. Register / login — returns user object + sets cookie
  const registerRes = await fetch("/api/forum/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature, nonce }),
  });
  if (!registerRes.ok) {
    const err = await registerRes.text().catch(() => "");
    throw new Error(`Register failed (${registerRes.status}): ${err}`);
  }
  const data = await registerRes.json();
  if (!data?.user) throw new Error("Register returned no user object");
  return data.user;
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
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authAttempted = useRef<string | null>(null);
  const authInProgress = useRef(false);

  // Keep a stable ref to signMessageAsync so it doesn't trigger useEffect re-runs
  const signMessageRef = useRef(signMessageAsync);
  signMessageRef.current = signMessageAsync;

  // Applies user data from either register response or fetchUserData
  const applyUser = useCallback((user: ForumUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    const isDefault =
      user.displayName.endsWith("...") && !user.profileImageUrl;
    setNeedsProfileSetup(isDefault);
  }, []);

  // Fetch DMs, notifications, friend requests (non-blocking sidebar data)
  const fetchSidebarData = useCallback(() => {
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

    fetch("/api/forum/notifications", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.notifications) {
          setNotifications(d.notifications);
        }
      })
      .catch(() => {});

    fetch("/api/forum/users/friends/requests", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.requests) {
          setPendingFriendRequestCount(d.requests.length);
        }
      })
      .catch(() => {});
  }, []);

  // Full auth flow: try cookie, then SIWE
  const runAuth = useCallback(async () => {
    if (authInProgress.current) return;
    authInProgress.current = true;
    setAuthLoading(true);
    setAuthError(null);

    try {
      // Try existing cookie first
      const res = await fetch("/api/forum/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          applyUser(data.user);
          fetchSidebarData();
          return;
        }
      }

      // No valid cookie — trigger SIWE auth flow
      const addr = authAttempted.current;
      if (!addr) return;
      const user = await authenticate(addr, signMessageRef.current);
      applyUser(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejected signature is not an error — just stop loading
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setAuthError(null);
      } else {
        console.error("[LOBSTR auth]", msg);
        setAuthError(msg);
      }
    } finally {
      setAuthLoading(false);
      authInProgress.current = false;
    }
  }, [applyUser, fetchSidebarData]);

  // Auth + profile flow on wallet connection
  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setUnreadDMCount(0);
      setNotifications([]);
      setPendingFriendRequestCount(0);
      setNeedsProfileSetup(false);
      setSetupDismissed(false);
      authAttempted.current = null;
      return;
    }

    // Prevent duplicate auth attempts for the same address
    if (authAttempted.current === address) return;
    authAttempted.current = address;

    runAuth();
    // Only re-run when wallet connection changes, not when signMessageAsync ref changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const retryAuth = useCallback(() => {
    if (!address || authInProgress.current) return;
    // Don't reset authAttempted — just re-run the flow
    runAuth();
  }, [address, runAuth]);

  // Poll for new notifications every 60 seconds (pauses when tab is hidden)
  useEffect(() => {
    if (!isAuthenticated) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let abortController: AbortController | null = null;

    const poll = () => {
      // Abort any in-flight requests from previous poll cycle
      abortController?.abort();
      abortController = new AbortController();
      const { signal } = abortController;

      fetch("/api/forum/notifications", { credentials: "include", signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.notifications) setNotifications(d.notifications);
        })
        .catch(() => {});

      fetch("/api/forum/messages", { credentials: "include", signal })
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

      fetch("/api/forum/users/friends/requests", { credentials: "include", signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.requests) {
            setPendingFriendRequestCount(d.requests.length);
          }
        })
        .catch(() => {});
    };

    const startPolling = () => {
      if (!interval) interval = setInterval(poll, 60_000);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        poll(); // Refresh immediately when tab becomes visible
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      abortController?.abort();
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAuthenticated]);

  const vote = useCallback(
    async (id: string, direction: 1 | -1) => {
      // Optimistic local update
      setVotes((prev) => {
        if (prev[id] === direction) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: direction };
      });

      // Determine endpoint from ID prefix: p = post, c = comment
      const isComment = id.startsWith("c");
      const endpoint = isComment
        ? `/api/forum/comments/${id}/vote`
        : `/api/forum/posts/${id}/vote`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: direction === 1 ? "up" : "down",
          }),
        });

        if (!res.ok) {
          // Revert optimistic update on failure
          setVotes((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      } catch {
        // Revert on network error
        setVotes((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    []
  );

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
  const showProfileSetup = needsProfileSetup && !setupDismissed;

  const value = useMemo(
    () => ({
      currentUser,
      isConnected: !!isConnected,
      isAuthenticated,
      authLoading,
      authError,
      retryAuth,
      needsProfileSetup: showProfileSetup,
      dismissProfileSetup,
      updateCurrentUser,
      votes,
      vote,
      unreadDMCount,
      notifications,
      unreadNotificationCount,
      markNotificationRead,
      markAllNotificationsRead,
      pendingFriendRequestCount,
      searchQuery,
      setSearchQuery,
    }),
    [
      currentUser,
      isConnected,
      isAuthenticated,
      authLoading,
      authError,
      retryAuth,
      showProfileSetup,
      dismissProfileSetup,
      updateCurrentUser,
      votes,
      vote,
      unreadDMCount,
      notifications,
      unreadNotificationCount,
      markNotificationRead,
      markAllNotificationsRead,
      pendingFriendRequestCount,
      searchQuery,
      setSearchQuery,
    ]
  );

  return (
    <ForumContext.Provider value={value}>
      {children}
    </ForumContext.Provider>
  );
}

export function useForum() {
  return useContext(ForumContext);
}
