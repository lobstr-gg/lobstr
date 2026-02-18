import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import {
  getReviewsForUser,
  getReviewSummaryForUser,
  getReviewByJobAndReviewer,
  createReview,
  nextId,
} from "@/lib/firestore-store";

// GET /api/forum/reviews?address=0x...&limit=20
export async function GET(request: NextRequest) {
  const limited = rateLimit(`reviews-get:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address parameter required" }, { status: 400 });
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    50
  );

  const [reviews, summary] = await Promise.all([
    getReviewsForUser(address, limit),
    getReviewSummaryForUser(address),
  ]);

  return NextResponse.json({ reviews, summary });
}

// POST /api/forum/reviews
export async function POST(request: NextRequest) {
  const limited = rateLimit(`reviews-post:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { jobId, revieweeAddress, role, rating, body: reviewBody } = body;

  // Validate required fields
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }
  if (!revieweeAddress || typeof revieweeAddress !== "string") {
    return NextResponse.json({ error: "revieweeAddress is required" }, { status: 400 });
  }
  if (role !== "buyer" && role !== "seller") {
    return NextResponse.json({ error: "role must be 'buyer' or 'seller'" }, { status: 400 });
  }
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json({ error: "rating must be an integer from 1 to 5" }, { status: 400 });
  }
  if (!reviewBody || typeof reviewBody !== "string" || reviewBody.length > 2000) {
    return NextResponse.json({ error: "body is required (max 2000 characters)" }, { status: 400 });
  }

  // Can't review yourself
  if (auth.address.toLowerCase() === revieweeAddress.toLowerCase()) {
    return NextResponse.json({ error: "You cannot review yourself" }, { status: 400 });
  }

  // Duplicate check
  const existing = await getReviewByJobAndReviewer(jobId, auth.address);
  if (existing) {
    return NextResponse.json(
      { error: "You have already reviewed this job" },
      { status: 409 }
    );
  }

  const id = await nextId("review");
  const review = {
    id,
    jobId,
    reviewerAddress: auth.address,
    revieweeAddress,
    role: role as "buyer" | "seller",
    rating,
    body: reviewBody,
    createdAt: Date.now(),
  };

  await createReview(review);
  return NextResponse.json({ review }, { status: 201 });
}
