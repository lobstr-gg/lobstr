"use client";

import { useState } from "react";
import ForumSidebar from "@/components/forum/ForumSidebar";
import ForumTrendingSidebar from "@/components/forum/ForumTrendingSidebar";
import ForumSearchBar from "@/components/forum/ForumSearchBar";

export default function ForumShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-2 mb-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg bg-surface-2 border border-border/50 text-text-secondary hover:text-text-primary"
          aria-label="Open forum navigation"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div className="flex-1">
          <ForumSearchBar />
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-surface-1 border-r border-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-text-primary">Forum</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded text-text-secondary hover:text-text-primary"
                aria-label="Close forum navigation"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ForumSidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-6 min-h-[calc(100vh-4rem)]">
        {/* Left sidebar — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <ForumSearchBar />
            <ForumSidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0">{children}</main>

        {/* Right sidebar — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <ForumTrendingSidebar />
          </div>
        </aside>
      </div>
    </>
  );
}
