export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-6 h-6 border-2 border-lob-green/30 border-t-lob-green rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
