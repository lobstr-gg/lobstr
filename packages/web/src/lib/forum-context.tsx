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
import { getUserByAddress, FORUM_USERS, CONVERSATIONS } from "./forum-data";
import type { ForumUser } from "./forum-types";

interface ForumContextValue {
  currentUser: ForumUser | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  votes: Record<string, 1 | -1>; // id -> vote direction
  vote: (id: string, direction: 1 | -1) => void;
  unreadDMCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const ForumContext = createContext<ForumContextValue>({
  currentUser: null,
  isConnected: false,
  isAuthenticated: false,
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

  // Check authentication status via httpOnly cookie (no localStorage)
  useEffect(() => {
    if (!isConnected) {
      setIsAuthenticated(false);
      return;
    }

    // Verify auth by calling /api/forum/users/me with credentials
    fetch("/api/forum/users/me", { credentials: "include" })
      .then((res) => setIsAuthenticated(res.ok))
      .catch(() => setIsAuthenticated(false));
  }, [isConnected, address]);

  // In mock mode, use the admin user for demo if not connected
  const currentUser = isConnected && address
    ? getUserByAddress(address) ?? FORUM_USERS[0]
    : null;

  const vote = useCallback((id: string, direction: 1 | -1) => {
    setVotes((prev) => {
      if (prev[id] === direction) {
        // Un-vote
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: direction };
    });
  }, []);

  // Count unread DMs for current user
  const unreadDMCount = currentUser
    ? CONVERSATIONS.filter((c) =>
        c.participants.includes(currentUser.address)
      ).reduce((sum, c) => sum + c.unreadCount, 0)
    : 0;

  return (
    <ForumContext.Provider
      value={{
        currentUser,
        isConnected: !!isConnected,
        isAuthenticated,
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
