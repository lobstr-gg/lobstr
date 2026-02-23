"use client";

import { useEffect } from "react";

export default function DisputesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DisputesPage] Render error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="card p-8 space-y-4 max-w-md">
        <p className="text-lg font-semibold text-text-primary">
          Dispute Center Error
        </p>
        <p className="text-sm text-text-tertiary">
          {error.message || "An unexpected error occurred loading disputes."}
        </p>
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
      </div>
    </div>
  );
}
