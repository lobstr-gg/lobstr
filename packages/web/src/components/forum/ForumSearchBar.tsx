"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";

interface SearchResults {
  posts: Array<{ id: string; title: string; subtopic: string }>;
  comments: Array<{ id: string; body: string; postId: string }>;
  users: Array<{
    address: string;
    displayName: string;
    karma: number;
    isAgent: boolean;
    flair: string | null;
  }>;
}

export default function ForumSearchBar() {
  const router = useRouter();
  const { searchQuery, setSearchQuery } = useForum();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce global search query
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(localQuery), 200);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery]);

  // Debounced API search
  const fetchResults = useCallback(async (query: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();

    if (query.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);

    try {
      const res = await fetch(
        `/api/forum/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults(null);
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchResults(localQuery), 300);
    return () => clearTimeout(timer);
  }, [localQuery, fetchResults]);

  const hasResults =
    results &&
    (results.posts.length > 0 ||
      results.comments.length > 0 ||
      results.users.length > 0);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <motion.div
        className="absolute inset-0 rounded border pointer-events-none"
        animate={{
          borderColor: focused ? "rgba(0,214,114,0.4)" : "transparent",
          boxShadow: focused
            ? "0 0 20px rgba(0,214,114,0.08)"
            : "0 0 0px transparent",
        }}
        transition={{ duration: 0.3 }}
      />
      <input
        type="text"
        placeholder="Search posts, comments, users..."
        value={localQuery}
        onChange={(e) => {
          setLocalQuery(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => {
          setFocused(true);
          setShowResults(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && localQuery.trim()) {
            router.push(`/forum/search?q=${encodeURIComponent(localQuery)}`);
            setShowResults(false);
          }
        }}
        className="input-field w-full text-sm"
      />

      <AnimatePresence>
        {showResults && localQuery.length > 1 && (hasResults || searching) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease }}
            className="absolute top-full left-0 right-0 mt-1 card p-2 z-50 max-h-72 overflow-y-auto"
          >
            {searching && !hasResults && (
              <p className="text-xs text-text-tertiary px-2 py-1.5">
                Searching...
              </p>
            )}

            {results?.posts.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  router.push(`/forum/${p.subtopic}/${p.id}`);
                  setShowResults(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
              >
                <p className="text-xs text-text-primary truncate">{p.title}</p>
                <p className="text-[10px] text-text-tertiary">
                  Post in {p.subtopic}
                </p>
              </button>
            ))}

            {results?.users.slice(0, 3).map((u) => (
              <button
                key={u.address}
                onClick={() => {
                  router.push(`/forum/u/${u.address}`);
                  setShowResults(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-text-primary">
                    {u.displayName}
                  </p>
                  {u.isAgent && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-lob-green/10 text-lob-green border border-lob-green/20">
                      Agent
                    </span>
                  )}
                  {u.flair && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-surface-2 text-text-tertiary border border-border/40">
                      {u.flair}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-text-tertiary">
                  {u.karma} karma
                </p>
              </button>
            ))}

            <button
              onClick={() => {
                router.push(
                  `/forum/search?q=${encodeURIComponent(localQuery)}`
                );
                setShowResults(false);
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-lob-green hover:bg-surface-2 rounded"
            >
              View all results
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
