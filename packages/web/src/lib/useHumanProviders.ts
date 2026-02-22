"use client";

import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { isIndexerConfigured, fetchListings, type IndexerListing } from "./indexer";
import type { HumanProvider, TaskCategory } from "@/app/rent-a-human/_data/types";

/** Physical Task category ID in ServiceRegistry */
const PHYSICAL_TASK_CATEGORY = 9;

/**
 * Maps a physical-task listing to a HumanProvider.
 * Parses metadataURI JSON for extended fields (skills, location, etc.)
 */
function mapListingToHumanProvider(listing: IndexerListing): HumanProvider {
  let meta: Record<string, unknown> = {};
  try {
    if (listing.metadataURI) {
      meta = JSON.parse(listing.metadataURI);
    }
  } catch {
    // metadataURI might not be valid JSON
  }

  const addr = listing.provider;
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const price = Number(formatEther(BigInt(listing.pricePerUnit)));

  // Extract skills from tags or metadata
  const tags = (meta.tags as string[]) ?? [];
  const skills = tags.length > 0
    ? tags.map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    : ["Physical Tasks"];

  // Map to task categories
  const categoryMap: Record<string, TaskCategory> = {
    "errands": "Errands & Delivery",
    "delivery": "Errands & Delivery",
    "document": "Document & Legal",
    "legal": "Document & Legal",
    "research": "Field Research",
    "field": "Field Research",
    "photography": "Photography & Video",
    "photo": "Photography & Video",
    "video": "Photography & Video",
    "hardware": "Hardware & Setup",
    "setup": "Hardware & Setup",
    "meeting": "Meetings & Events",
    "event": "Meetings & Events",
    "testing": "Testing & QA",
    "qa": "Testing & QA",
  };

  const categories: TaskCategory[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const [key, cat] of Object.entries(categoryMap)) {
      if (lower.includes(key) && !categories.includes(cat)) {
        categories.push(cat);
      }
    }
  }
  if (categories.length === 0) {
    categories.push("Other Physical");
  }

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
      continent: (meta.continent as "North America" | "Europe" | "Asia" | "South America" | "Africa" | "Oceania") ?? "North America",
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

export function useHumanProviders() {
  const indexerReady = isIndexerConfigured();

  const query = useQuery({
    queryKey: ["human-providers"],
    queryFn: async () => {
      const allListings = await fetchListings();
      return allListings
        .filter((l) => l.category === PHYSICAL_TASK_CATEGORY && l.active)
        .map(mapListingToHumanProvider);
    },
    enabled: indexerReady,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
