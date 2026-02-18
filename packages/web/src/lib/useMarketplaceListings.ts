"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { formatEther, type Address, parseAbiItem } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { ServiceRegistryABI } from "@/config/abis";
import { SERVICE_CATEGORY_MAP, type MockListing, type ServiceCategory } from "@/app/marketplace/_data/types";

interface OnChainListing {
  id: bigint;
  provider: Address;
  category: number;
  title: string;
  description: string;
  pricePerUnit: bigint;
  settlementToken: Address;
  estimatedDeliverySeconds: bigint;
  metadataURI: string;
  active: boolean;
  createdAt: bigint;
}

function mapToMockListing(listing: OnChainListing, lobTokenAddress: Address): MockListing {
  const price = Number(formatEther(listing.pricePerUnit));
  const category: ServiceCategory = SERVICE_CATEGORY_MAP[listing.category] ?? "Other";
  const isLob = listing.settlementToken.toLowerCase() === lobTokenAddress.toLowerCase();

  return {
    id: listing.id.toString(),
    title: listing.title || `Listing #${listing.id}`,
    description: listing.description || "No description",
    category,
    price,
    settlementToken: isLob ? "LOB" : "USDC",
    estimatedDeliveryHours: Number(listing.estimatedDeliverySeconds) / 3600,
    provider: {
      address: listing.provider,
      name: listing.provider.slice(0, 6) + "..." + listing.provider.slice(-4),
      providerType: "agent",
      reputationScore: 0,
      reputationTier: "Bronze",
      completions: 0,
      stakeTier: "Bronze",
      responseTime: "--",
      responseTimeMinutes: 0,
      completionRate: 100,
    },
    transactionType: "agent-to-agent",
    tags: [category.toLowerCase()],
    createdAt: Number(listing.createdAt) * 1000,
    active: listing.active,
  };
}

export function useMarketplaceListings() {
  const publicClient = usePublicClient();
  const contracts = getContracts(CHAIN.id);
  const [listings, setListings] = useState<MockListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!publicClient || !contracts) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchListings() {
      try {
        // Get all ListingCreated events to discover listing IDs
        const logs = await publicClient!.getContractEvents({
          address: contracts!.serviceRegistry,
          abi: ServiceRegistryABI,
          eventName: "ListingCreated",
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (cancelled) return;

        if (logs.length === 0) {
          setListings([]);
          setIsLoading(false);
          return;
        }

        // Extract unique listing IDs
        const listingIds = logs.map((log) => {
          const args = log.args as { listingId?: bigint };
          return args.listingId!;
        });

        // Multicall to fetch all listings
        const results = await publicClient!.multicall({
          contracts: listingIds.map((id) => ({
            address: contracts!.serviceRegistry,
            abi: ServiceRegistryABI,
            functionName: "getListing",
            args: [id],
          })),
        });

        if (cancelled) return;

        const mapped: MockListing[] = [];
        for (const result of results) {
          if (result.status === "success" && result.result) {
            const listing = result.result as unknown as OnChainListing;
            mapped.push(mapToMockListing(listing, contracts!.lobToken));
          }
        }

        setListings(mapped);
        setIsError(false);
      } catch (err) {
        console.error("Failed to fetch marketplace listings:", err);
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchListings();

    return () => {
      cancelled = true;
    };
  }, [publicClient, contracts]);

  return { listings, isLoading, isError };
}
