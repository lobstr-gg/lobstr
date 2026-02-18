import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="card p-8 space-y-4 max-w-md">
        <p className="text-4xl font-bold text-brand">404</p>
        <p className="text-lg font-semibold text-text-primary">Page not found</p>
        <p className="text-sm text-text-tertiary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className="btn-primary inline-block">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
