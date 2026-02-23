"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { formatEther, type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { ServiceRegistryABI } from "@/config/abis";
import { SERVICE_CATEGORY_MAP, type MarketplaceListing, type ServiceCategory } from "@/app/marketplace/_data/types";
import { isIndexerConfigured, fetchListings as fetchIndexerListings, type IndexerListing } from "./indexer";
import { useQuery } from "@tanstack/react-query";

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

function mapToMarketplaceListing(listing: OnChainListing, lobTokenAddress: Address): MarketplaceListing {
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

function mapIndexerToMarketplaceListing(listing: IndexerListing, lobTokenAddress: string): MarketplaceListing {
  const price = Number(formatEther(BigInt(listing.pricePerUnit)));
  const category: ServiceCategory = SERVICE_CATEGORY_MAP[listing.category] ?? "Other";
  const isLob = listing.settlementToken.toLowerCase() === lobTokenAddress.toLowerCase();

  return {
    id: listing.id,
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
  const contracts = getContracts(CHAIN.id);
  const useIndexer = isIndexerConfigured();

  // Indexer-backed path
  const indexerQuery = useQuery({
    queryKey: ["marketplace-listings-indexer"],
    queryFn: async () => {
      const raw = await fetchIndexerListings();
      return raw.map((l) => mapIndexerToMarketplaceListing(l, contracts?.lobToken ?? ""));
    },
    enabled: useIndexer && !!contracts,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // Fallback: event-scanning path
  const publicClient = usePublicClient();
  const [fallbackListings, setFallbackListings] = useState<MarketplaceListing[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(true);
  const [fallbackError, setFallbackError] = useState(false);

  useEffect(() => {
    if (useIndexer) return; // skip if indexer is configured
    if (!publicClient || !contracts) {
      setFallbackLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchListings() {
      try {
        const logs = await publicClient!.getContractEvents({
          address: contracts!.serviceRegistry,
          abi: ServiceRegistryABI,
          eventName: "ListingCreated",
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (cancelled) return;

        if (logs.length === 0) {
          setFallbackListings([]);
          setFallbackLoading(false);
          return;
        }

        const listingIds = logs.map((log) => {
          const args = log.args as { listingId?: bigint };
          return args.listingId!;
        });

        const results = await publicClient!.multicall({
          contracts: listingIds.map((id) => ({
            address: contracts!.serviceRegistry,
            abi: ServiceRegistryABI,
            functionName: "getListing",
            args: [id],
          })),
        });

        if (cancelled) return;

        const mapped: MarketplaceListing[] = [];
        for (const result of results) {
          if (result.status === "success" && result.result) {
            const listing = result.result as unknown as OnChainListing;
            mapped.push(mapToMarketplaceListing(listing, contracts!.lobToken));
          }
        }

        setFallbackListings(mapped);
        setFallbackError(false);
      } catch (err) {
        console.error("Failed to fetch marketplace listings:", err);
        if (!cancelled) {
          setFallbackError(true);
        }
      } finally {
        if (!cancelled) {
          setFallbackLoading(false);
        }
      }
    }

    fetchListings();

    return () => {
      cancelled = true;
    };
  }, [publicClient, contracts, useIndexer]);

  if (useIndexer) {
    return {
      listings: indexerQuery.data ?? [],
      isLoading: indexerQuery.isLoading,
      isError: indexerQuery.isError,
    };
  }

  return { listings: fallbackListings, isLoading: fallbackLoading, isError: fallbackError };
}
