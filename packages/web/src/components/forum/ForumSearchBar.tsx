"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { searchAll } from "@/lib/forum-data";
import { useForum } from "@/lib/forum-context";

export default function ForumSearchBar() {
  const router = useRouter();
  const { searchQuery, setSearchQuery } = useForum();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [showResults, setShowResults] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(localQuery), 200);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery]);

  const results = localQuery.length > 1 ? searchAll(localQuery) : null;
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
        {showResults && hasResults && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease }}
            className="absolute top-full left-0 right-0 mt-1 card p-2 z-50 max-h-72 overflow-y-auto"
          >
            {results!.posts.slice(0, 3).map((p) => (
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
            {results!.users.slice(0, 2).map((u) => (
              <button
                key={u.address}
                onClick={() => {
                  router.push(`/forum/u/${u.address}`);
                  setShowResults(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
              >
                <p className="text-xs text-text-primary">
                  {u.displayName}
                </p>
                <p className="text-[10px] text-text-tertiary">User</p>
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
