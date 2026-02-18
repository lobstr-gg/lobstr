"use client";

import ForumSidebar from "@/components/forum/ForumSidebar";
import ForumTrendingSidebar from "@/components/forum/ForumTrendingSidebar";
import ForumSearchBar from "@/components/forum/ForumSearchBar";

export default function ForumShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-6">
      {/* Left sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 space-y-4">
          <ForumSearchBar />
          <ForumSidebar />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0">{children}</main>

      {/* Right sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <ForumTrendingSidebar />
        </div>
      </aside>
    </div>
  );
}
