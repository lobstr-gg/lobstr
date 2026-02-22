import { NextRequest, NextResponse } from "next/server";
import type { HumanProvider, TaskCategory, RegionCode } from "@/app/rent-a-human/_data/types";
import { continentToRegion } from "@/app/rent-a-human/_data/types";
import { fetchListings, isIndexerConfigured, type IndexerListing } from "@/lib/indexer";
import { formatEther } from "viem";

const PHYSICAL_TASK_CATEGORY = 9;

function mapListingToHumanProvider(listing: IndexerListing): HumanProvider {
  let meta: Record<string, unknown> = {};
  try {
    if (listing.metadataURI) meta = JSON.parse(listing.metadataURI);
  } catch { /* ignore */ }

  const addr = listing.provider;
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const price = Number(formatEther(BigInt(listing.pricePerUnit)));
  const tags = (meta.tags as string[]) ?? [];
  const skills = tags.length > 0
    ? tags.map((t: string) => t.charAt(0).toUpperCase() + t.slice(1))
    : ["Physical Tasks"];

  const categoryMap: Record<string, TaskCategory> = {
    "errands": "Errands & Delivery", "delivery": "Errands & Delivery",
    "document": "Document & Legal", "legal": "Document & Legal",
    "research": "Field Research", "field": "Field Research",
    "photography": "Photography & Video", "photo": "Photography & Video", "video": "Photography & Video",
    "hardware": "Hardware & Setup", "setup": "Hardware & Setup",
    "meeting": "Meetings & Events", "event": "Meetings & Events",
    "testing": "Testing & QA", "qa": "Testing & QA",
  };

  const categories: TaskCategory[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const [key, cat] of Object.entries(categoryMap)) {
      if (lower.includes(key) && !categories.includes(cat)) categories.push(cat);
    }
  }
  if (categories.length === 0) categories.push("Other Physical");

  return {
    id: listing.id,
    name: (meta.providerName as string) ?? shortAddr,
    address: addr,
    avatar: shortAddr,
    bio: listing.description || "Physical task provider",
    skills,
    categories,
    location: (meta.location as string) ?? "Remote",
    locationInfo: {
      city: (meta.city as string) ?? "Unknown",
      region: (meta.region as string) ?? "Unknown",
      country: (meta.country as string) ?? "Unknown",
      countryCode: (meta.countryCode as string) ?? "XX",
      continent: (meta.continent as "North America") ?? "North America",
    },
    timezone: (meta.timezone as string) ?? "UTC",
    hourlyRate: price,
    flatRates: {},
    availability: listing.active ? "available" : "offline",
    responseTime: "--",
    completions: 0,
    rating: 0,
    reputationScore: 0,
    reputationTier: "Bronze",
    verified: false,
    joinedAt: Number(listing.createdAt) * 1000,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const skill = searchParams.get("skill")?.toLowerCase();
  const category = searchParams.get("category") as TaskCategory | null;
  const location = searchParams.get("location")?.toLowerCase();
  const region = searchParams.get("region") as RegionCode | null;
  const minRating = searchParams.get("minRating")
    ? parseFloat(searchParams.get("minRating")!)
    : null;
  const maxRate = searchParams.get("maxRate")
    ? parseFloat(searchParams.get("maxRate")!)
    : null;

  let results: HumanProvider[] = [];

  // Fetch from indexer if configured
  if (isIndexerConfigured()) {
    try {
      const allListings = await fetchListings();
      results = allListings
        .filter((l) => l.category === PHYSICAL_TASK_CATEGORY && l.active)
        .map(mapListingToHumanProvider);
    } catch {
      // Indexer unavailable — return empty
    }
  }

  if (skill) {
    results = results.filter(
      (h) =>
        h.skills.some((s) => s.toLowerCase().includes(skill)) ||
        h.bio.toLowerCase().includes(skill)
    );
  }

  if (category) {
    results = results.filter((h) => h.categories.includes(category));
  }

  if (location) {
    results = results.filter((h) =>
      h.location.toLowerCase().includes(location)
    );
  }

  if (region && region !== "all") {
    results = results.filter(
      (h) => continentToRegion(h.locationInfo.continent) === region
    );
  }

  if (minRating !== null) {
    results = results.filter((h) => h.rating >= minRating);
  }

  if (maxRate !== null) {
    results = results.filter((h) => h.hourlyRate <= maxRate);
  }

  return NextResponse.json({
    count: results.length,
    humans: results,
  });
}
