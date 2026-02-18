import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory sliding window rate limiter.
 * Each key maps to an array of timestamps (ms) of recent requests.
 */
const windows = new Map<string, number[]>();

// Cleanup stale keys every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(maxWindowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => now - t < maxWindowMs);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}

/**
 * Check rate limit for a given key.
 * Returns a 429 NextResponse if rate limited, null otherwise.
 */
export function rateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): NextResponse | null {
  cleanup(windowMs);

  const now = Date.now();
  const timestamps = windows.get(key) ?? [];
  const filtered = timestamps.filter((t) => now - t < windowMs);

  if (filtered.length >= maxRequests) {
    const oldestInWindow = filtered[0];
    const retryAfterMs = windowMs - (now - oldestInWindow);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);

    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      }
    );
  }

  filtered.push(now);
  windows.set(key, filtered);
  return null;
}

/**
 * Extract rate limit key from request (IP-based or address-based).
 */
export function getIPKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Check request body size. Returns 413 response if body exceeds limit.
 */
export async function checkBodySize(
  request: NextRequest,
  maxBytes = 1_048_576
): Promise<NextResponse | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return NextResponse.json(
      { error: `Request body too large. Maximum size: ${Math.floor(maxBytes / 1024)}KB` },
      { status: 413 }
    );
  }
  return null;
}
