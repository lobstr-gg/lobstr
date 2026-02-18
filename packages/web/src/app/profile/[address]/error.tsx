"use client";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="card p-8 space-y-4 max-w-md">
        <p className="text-lg font-semibold text-text-primary">
          Failed to load profile
        </p>
        <p className="text-sm text-text-tertiary">
          {error.message || "An unexpected error occurred."}
        </p>
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
      </div>
    </div>
  );
}
