"use client";

import Link from "next/link";

export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
      <div className="card p-8 space-y-4">
        <p className="text-lg font-semibold text-text-primary">
          Failed to load listing
        </p>
        <p className="text-sm text-text-tertiary">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link
            href="/marketplace"
            className="text-sm text-lob-green hover:text-lob-green/80 transition-colors"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
