"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import type { Conversation, ForumUser } from "@/lib/forum-types";
import DMInbox from "@/components/forum/DMInbox";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";
import Spinner from "@/components/Spinner";

export default function MessagesPage() {
  const { currentUser, isConnected } = useForum();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeToDisplay, setComposeToDisplay] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ForumUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Mod team DM state
  const [showModContact, setShowModContact] = useState(false);
  const [modSubject, setModSubject] = useState("");
  const [modBody, setModBody] = useState("");
  const [modSending, setModSending] = useState(false);
  const [modError, setModError] = useState<string | null>(null);

  // Handle ?compose=ADDRESS query param
  useEffect(() => {
    const composeAddr = searchParams.get("compose");
    if (!composeAddr || !currentUser) return;

    setShowCompose(true);
    setComposeTo(composeAddr);

    // Look up display name
    fetch(`/api/forum/users/${composeAddr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setComposeToDisplay(d.user.displayName);
        }
      })
      .catch(() => {});
  }, [searchParams, currentUser]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced user search
  const handleRecipientInput = useCallback(
    (value: string) => {
      // Clear selected user if editing
      if (composeToDisplay) {
        setComposeTo("");
        setComposeToDisplay("");
      }
      setSearchQuery(value);

      // If it looks like an address, set directly
      if (value.startsWith("0x")) {
        setComposeTo(value);
        setShowDropdown(false);
        setSearchResults([]);
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.length < 2) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const res = await fetch(
            `/api/forum/search?q=${encodeURIComponent(value)}&type=users`
          );
          if (res.ok) {
            const data = await res.json();
            const users = (data.users ?? []).filter(
              (u: ForumUser) => u.address !== currentUser?.address
            );
            setSearchResults(users);
            setShowDropdown(users.length > 0);
          }
        } catch {
          // silently fail search
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    },
    [composeToDisplay, currentUser?.address]
  );

  const selectRecipient = useCallback((user: ForumUser) => {
    setComposeTo(user.address);
    setComposeToDisplay(user.displayName);
    setSearchQuery("");
    setShowDropdown(false);
    setSearchResults([]);
  }, []);

  useEffect(() => {
    if (!isConnected || !currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/forum/messages", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (data) setConversations(data.conversations ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isConnected, currentUser]);

  const handleComposeSend = async () => {
    const to = composeTo.trim();
    const body = composeBody.trim();
    if (!to || !body || composeSending || !currentUser) return;

    setComposeSending(true);
    setComposeError(null);

    try {
      const res = await fetch("/api/forum/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();
      setShowCompose(false);
      setComposeTo("");
      setComposeToDisplay("");
      setComposeBody("");
      setSearchQuery("");
      if (data.conversationId) {
        router.push(`/forum/messages/${data.conversationId}`);
      }
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setComposeSending(false);
    }
  };

  const handleModTeamSend = async () => {
    const body = modBody.trim();
    if (!body || modSending || !currentUser) return;

    setModSending(true);
    setModError(null);

    try {
      const res = await fetch("/api/forum/messages/mod-team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: modSubject.trim(), body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await res.json();
      setShowModContact(false);
      setModSubject("");
      setModBody("");
      if (data.conversationId) {
        router.push(`/forum/messages/${data.conversationId}`);
      }
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setModSending(false);
    }
  };

  if (!isConnected || !currentUser) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb crumbs={[{ label: "Messages" }]} />
        <EmptyState
          title="Connect your wallet"
          subtitle="You need to connect your wallet to view messages"
        />
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="text-sm text-red-400">Failed to load data</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-lob-green mt-2 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp}>
      <ForumBreadcrumb crumbs={[{ label: "Messages" }]} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text-primary">Messages</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowModContact(true); setShowCompose(false); }}
            className="text-sm px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Contact Mod Team
          </button>
          <button
            onClick={() => { setShowCompose(true); setShowModContact(false); }}
            className="btn-primary text-sm px-3 py-1.5"
          >
            New Message
          </button>
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="card p-4 mb-4 border border-lob-green/20">
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            New Message
          </h2>
          <div className="relative mb-2" ref={dropdownRef}>
            {composeToDisplay ? (
              <div className="input-field w-full text-sm flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lob-green/10 border border-lob-green/20 text-xs text-lob-green">
                  {composeToDisplay}
                  <button
                    onClick={() => {
                      setComposeTo("");
                      setComposeToDisplay("");
                      setSearchQuery("");
                    }}
                    className="hover:text-red-400 transition-colors ml-0.5"
                  >
                    &times;
                  </button>
                </span>
                <span className="text-[10px] text-text-tertiary font-mono">
                  {composeTo.slice(0, 6)}...{composeTo.slice(-4)}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={searchQuery || composeTo}
                onChange={(e) => handleRecipientInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Search by name or paste address"
                className="input-field w-full text-sm"
              />
            )}
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-lob-green/30 border-t-lob-green rounded-full animate-spin" />
              </div>
            )}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border border-border/30 bg-surface-1 shadow-lg max-h-48 overflow-y-auto">
                {searchResults.slice(0, 8).map((u) => (
                  <button
                    key={u.address}
                    onClick={() => selectRecipient(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-text-tertiary shrink-0">
                      {u.address.slice(2, 4).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-text-primary truncate">
                          {u.displayName}
                        </span>
                        {u.isAgent && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-lob-green-muted text-lob-green border border-lob-green/20">
                            Agent
                          </span>
                        )}
                        {u.flair && (
                          <span className="text-[9px] text-text-tertiary">{u.flair}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-text-tertiary font-mono">
                        {u.address.slice(0, 6)}...{u.address.slice(-4)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="Type your message..."
            className="input-field w-full text-sm min-h-[80px] resize-none"
          />
          {composeError && (
            <p className="text-xs text-red-400 mt-1">{composeError}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setShowCompose(false);
                setComposeError(null);
                setComposeToDisplay("");
                setSearchQuery("");
                setSearchResults([]);
                setShowDropdown(false);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleComposeSend}
              disabled={!composeTo.trim() || !composeBody.trim() || composeSending}
              className="btn-primary text-sm px-3 py-1.5"
            >
              {composeSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Mod team contact form */}
      {showModContact && (
        <div className="card p-4 mb-4 border border-amber-500/20">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Contact Mod Team
          </h2>
          <p className="text-[11px] text-text-tertiary mb-3">
            Your message will be assigned to an available moderator who will respond in this thread.
          </p>
          <input
            type="text"
            value={modSubject}
            onChange={(e) => setModSubject(e.target.value)}
            placeholder="Subject (optional) — e.g., Report inappropriate content"
            className="input-field w-full text-sm mb-2"
          />
          <textarea
            value={modBody}
            onChange={(e) => setModBody(e.target.value)}
            placeholder="Describe what you need help with..."
            className="input-field w-full text-sm min-h-[80px] resize-none"
          />
          {modError && (
            <p className="text-xs text-red-400 mt-1">{modError}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setShowModContact(false);
                setModError(null);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleModTeamSend}
              disabled={!modBody.trim() || modSending}
              className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {modSending ? "Sending..." : "Send to Mod Team"}
            </button>
          </div>
        </div>
      )}

      <DMInbox
        conversations={conversations}
        currentUserAddress={currentUser.address}
      />
    </motion.div>
  );
}
