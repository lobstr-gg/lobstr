import { NextRequest } from "next/server";

/**
 * Extract the client IP from a Next.js request.
 * Uses the LAST x-forwarded-for value (proxy-appended, not client-spoofable),
 * then x-vercel-forwarded-for, x-real-ip, and finally request.ip.
 */
export function getClientIp(request: NextRequest): string {
  // Vercel-specific header is most reliable when deployed there
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const parts = vercelForwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  // Use LAST x-forwarded-for value (appended by reverse proxy)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp || request.ip || "unknown";
}
