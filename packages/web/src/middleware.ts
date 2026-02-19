import { NextRequest, NextResponse } from "next/server";

/**
 * Platform-wide IP ban middleware.
 *
 * Extracts the client IP from the request, checks it against the
 * internal ban-check API (backed by Firestore), and returns a 403
 * for banned IPs. Fail-open: if the check errors, the request
 * proceeds normally to avoid blocking legitimate users.
 */
export async function middleware(request: NextRequest) {
  // Use last x-forwarded-for value (proxy-appended, not client-spoofable)
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  let ip: string;
  if (vercelForwarded) {
    const parts = vercelForwarded.split(",");
    ip = parts[parts.length - 1].trim();
  } else if (forwarded) {
    const parts = forwarded.split(",");
    ip = parts[parts.length - 1].trim();
  } else {
    ip = realIp || request.ip || "unknown";
  }

  // Skip check for unknown IPs (local dev, missing headers)
  if (ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return NextResponse.next();
  }

  // CSRF protection: validate Origin header on state-changing requests
  const method = request.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const expectedOrigins = [
        `https://${host}`,
        `http://${host}`, // Allow http in development
      ];
      if (!expectedOrigins.some((expected) => origin === expected)) {
        return new NextResponse("CSRF validation failed", { status: 403 });
      }
    }
    // If Origin header is absent, allow the request (non-browser clients
    // may omit it, and they can't exploit cookies anyway)
  }

  try {
    const checkUrl = new URL("/api/internal/ip-check", request.nextUrl.origin);
    checkUrl.searchParams.set("ip", ip);

    const internalKey = process.env.INTERNAL_API_KEY;
    if (!internalKey) {
      // No key configured — skip ban check rather than leak a hardcoded secret
      return NextResponse.next();
    }

    const res = await fetch(checkUrl.toString(), {
      headers: { "x-internal-key": internalKey },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.banned) {
        return new NextResponse(
          `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Access Denied — LOBSTR</title>
<style>
  body { background: #000; color: #888; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .container { text-align: center; max-width: 480px; padding: 2rem; }
  h1 { color: #ff4444; font-size: 1.25rem; margin-bottom: 0.5rem; }
  p { font-size: 0.875rem; line-height: 1.6; color: #666; }
  a { color: #00D672; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .code { font-family: monospace; color: #444; font-size: 0.75rem; margin-top: 1.5rem; }
</style>
</head>
<body>
  <div class="container">
    <h1>Access Denied</h1>
    <p>Your IP address has been banned from the LOBSTR platform due to a violation of our <a href="/terms">Terms of Service</a>.</p>
    <p>If you believe this is an error, contact a moderator on the <a href="https://x.com/yeshuarespecter" target="_blank" rel="noopener">LOBSTR X account</a>.</p>
    <div class="code">ERR_IP_BANNED</div>
  </div>
</body>
</html>`,
          {
            status: 403,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      }
    }
  } catch {
    // Fail open — never block users due to an internal error
  }

  // Pass client IP downstream for logging / rate limiting
  const response = NextResponse.next();
  response.headers.set("x-client-ip", ip);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - /api/internal/* (ban-check API, prevents circular calls)
     * - /_next/* (static assets, HMR)
     * - /favicon*, /logo*, /icon*, /apple* (static files)
     */
    "/((?!api/internal|_next|favicon|logo|icon|apple).*)",
  ],
};
