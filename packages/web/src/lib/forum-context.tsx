"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import type { ForumUser } from "./forum-types";

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
  searchQuery: "",
  setSearchQuery: () => {},
});

export function ForumProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<ForumUser | null>(null);
  const [unreadDMCount, setUnreadDMCount] = useState(0);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);

  // Check authentication status and fetch user profile
  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setUnreadDMCount(0);
      setNeedsProfileSetup(false);
      setSetupDismissed(false);
      return;
    }

    // Fetch user profile from API (getOrCreate)
    fetch("/api/forum/users/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
          return res.json();
        }
        setIsAuthenticated(false);
        return null;
      })
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          // Check if profile is still in default state (address-based name, no image)
          const user = data.user as ForumUser;
          const isDefault =
            user.displayName.endsWith("...") && !user.profileImageUrl;
          setNeedsProfileSetup(isDefault);
        }
      })
      .catch(() => setIsAuthenticated(false));

    // Fetch unread DM count
    fetch("/api/forum/messages", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.conversations) {
          const total = data.conversations.reduce(
            (sum: number, c: { unreadCount?: number }) =>
              sum + (c.unreadCount || 0),
            0
          );
          setUnreadDMCount(total);
        }
      })
      .catch(() => {});
  }, [isConnected, address]);

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
