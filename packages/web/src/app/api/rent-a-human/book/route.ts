import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createBooking } from "@/lib/firestore-store";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import { fetchListings, isIndexerConfigured } from "@/lib/indexer";

/** Physical Task category in ServiceRegistry */
const PHYSICAL_TASK_CATEGORY = 9;

export async function POST(request: NextRequest) {
  const limited = rateLimit(`book:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  // Require authentication — use authenticated address, not body-supplied
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  let body: {
    humanId?: string;
    taskTitle?: string;
    taskDescription?: string;
    budget?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { humanId, taskTitle, taskDescription, budget } = body;
  // Use authenticated address instead of accepting from body
  const requesterAddress = auth.address;

  if (!humanId || !taskTitle || !taskDescription || !budget) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: humanId, taskTitle, taskDescription, budget",
      },
      { status: 400 }
    );
  }

  if (typeof taskTitle !== "string" || taskTitle.length > 200) {
    return NextResponse.json(
      { error: "Task title must be 200 characters or fewer" },
      { status: 400 }
    );
  }

  if (typeof taskDescription !== "string" || taskDescription.length > 5_000) {
    return NextResponse.json(
      { error: "Task description must be 5,000 characters or fewer" },
      { status: 400 }
    );
  }

  if (typeof budget !== "number" || budget <= 0 || budget > 1_000_000) {
    return NextResponse.json(
      { error: "Budget must be a positive number up to 1,000,000" },
      { status: 400 }
    );
  }

  // Validate humanId against real on-chain listings
  let providerName = humanId;
  let providerLocation = "Remote";

  if (isIndexerConfigured()) {
    try {
      const listings = await fetchListings();
      const listing = listings.find(
        (l) => l.id === humanId && l.category === PHYSICAL_TASK_CATEGORY && l.active
      );
      if (!listing) {
        return NextResponse.json(
          { error: `Provider listing "${humanId}" not found or inactive` },
          { status: 404 }
        );
      }
      providerName = `${listing.provider.slice(0, 6)}...${listing.provider.slice(-4)}`;
      try {
        const meta = JSON.parse(listing.metadataURI);
        providerName = (meta.providerName as string) ?? providerName;
        providerLocation = (meta.location as string) ?? providerLocation;
      } catch {
        // metadataURI may not be JSON
      }
    } catch {
      // Indexer fetch failed — allow booking anyway (soft validation)
    }
  }

  const bookingId = `hb_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const booking = {
    id: bookingId,
    humanId,
    taskTitle,
    taskDescription,
    budget,
    requesterAddress,
    status: "pending" as const,
    createdAt: Date.now(),
  };

  await createBooking(booking);

  return NextResponse.json({
    bookingId,
    status: "pending",
    human: {
      id: humanId,
      name: providerName,
      location: providerLocation,
    },
  });
}
