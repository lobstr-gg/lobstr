"use client";

import dynamic from "next/dynamic";
import Spinner from "@/components/Spinner";

// Dynamically import with SSR disabled — dependencies use browser-only indexedDB
const MessagesContent = dynamic(() => import("./_components/MessagesContent"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Spinner />
    </div>
  ),
});

export default function MessagesPage() {
  return <MessagesContent />;
}
