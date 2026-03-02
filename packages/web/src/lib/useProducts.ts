"use client";

import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { type Address, formatEther } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { ZERO_ADDRESS } from "@/config/contract-addresses";
import { ProductMarketplaceABI, ServiceRegistryABI, LOBTokenABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

function isProductsLive(contracts: ReturnType<typeof useContracts>) {
  return !!contracts && contracts.productMarketplace !== ZERO_ADDRESS;
}

// ── READ hooks ──────────────────────────────────────────────────────────

/** Get product by ID */
export function useProduct(productId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "getProduct",
    args: productId !== undefined ? [productId] : undefined,
    query: { enabled: productId !== undefined && isProductsLive(contracts) },
  });
}

/** Get auction by ID */
export function useAuction(auctionId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "getAuction",
    args: auctionId !== undefined ? [auctionId] : undefined,
    query: { enabled: auctionId !== undefined && isProductsLive(contracts) },
  });
}

/** Get shipment tracking by job ID */
export function useShipment(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "getShipment",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && isProductsLive(contracts) },
  });
}

/** Get next product ID (useful for iterating) */
export function useNextProductId() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "nextProductId",
    query: { enabled: isProductsLive(contracts), refetchInterval: 15_000 },
  });
}

/** Get next auction ID */
export function useNextAuctionId() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "nextAuctionId",
    query: { enabled: isProductsLive(contracts), refetchInterval: 15_000 },
  });
}

/** Get pending bid withdrawal for an address */
export function usePendingWithdrawal(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isProductsLive(contracts) },
  });
}

/** Get real buyer for a product job */
export function useJobBuyer(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "jobBuyer",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && isProductsLive(contracts) },
  });
}

/** Get receipt timestamp for return window checks */
export function useReceiptTimestamp(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "receiptTimestamp",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && isProductsLive(contracts) },
  });
}

/** Get auction ID for a product */
export function useProductAuction(productId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.productMarketplace,
    abi: ProductMarketplaceABI,
    functionName: "productAuction",
    args: productId !== undefined ? [productId] : undefined,
    query: { enabled: productId !== undefined && isProductsLive(contracts) },
  });
}

// ── WRITE hooks ─────────────────────────────────────────────────────────

/** Register a product for an existing ServiceRegistry listing */
export function useCreateProduct() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (
    listingId: bigint,
    condition: number,
    productCategory: string,
    shippingInfoURI: string,
    imageURI: string,
    quantity: bigint,
    requiresTracking: boolean,
    listingType: number,
  ) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "createProduct",
      args: [listingId, condition, productCategory, shippingInfoURI, imageURI, quantity, requiresTracking, listingType],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Buy a fixed-price product. maxPrice provides slippage protection. */
export function useBuyProduct() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (productId: bigint, maxPrice: bigint, deliveryDeadline: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "buyProduct",
      args: [productId, maxPrice, deliveryDeadline],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Place a bid on an auction */
export function usePlaceBid() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (auctionId: bigint, bidAmount: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "placeBid",
      args: [auctionId, bidAmount],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Buy now on an auction */
export function useBuyNow() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (auctionId: bigint, deliveryDeadline: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "buyNow",
      args: [auctionId, deliveryDeadline],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Settle an ended auction */
export function useSettleAuction() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (auctionId: bigint, deliveryDeadline: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "settleAuction",
      args: [auctionId, deliveryDeadline],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Withdraw pending bid refund */
export function useWithdrawBid() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async () => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "withdrawBid",
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Seller provides shipping info */
export function useShipProduct() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (jobId: bigint, carrier: string, trackingNumber: string) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "shipProduct",
      args: [jobId, carrier, trackingNumber],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Buyer confirms receipt */
export function useConfirmReceipt() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (jobId: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "confirmReceipt",
      args: [jobId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Report damaged item */
export function useReportDamaged() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (jobId: bigint, evidenceURI: string) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "reportDamaged",
      args: [jobId, evidenceURI],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Request return */
export function useRequestReturn() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (jobId: bigint, reason: string) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "requestReturn",
      args: [jobId, reason],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Update product metadata */
export function useUpdateProduct() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (productId: bigint, imageURI: string, shippingInfoURI: string) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "updateProduct",
      args: [productId, imageURI, shippingInfoURI],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Deactivate product listing */
export function useDeactivateProduct() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (productId: bigint) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "deactivateProduct",
      args: [productId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Create auction for a product */
export function useCreateAuction() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (
    productId: bigint,
    startPrice: bigint,
    reservePrice: bigint,
    buyNowPrice: bigint,
    duration: bigint,
  ) => {
    if (!isProductsLive(contracts)) throw new Error("Product marketplace not available");
    return writeContractAsync({
      address: contracts!.productMarketplace as Address,
      abi: ProductMarketplaceABI,
      functionName: "createAuction",
      args: [productId, startPrice, reservePrice, buyNowPrice, duration],
    });
  };

  return { fn, isPending, isError, error, reset };
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function formatProductPrice(
  price: bigint,
  token: string,
  lobToken?: string,
): string {
  const formatted = parseFloat(formatEther(price)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  const symbol = token.toLowerCase() === lobToken?.toLowerCase() ? "LOB" : "USDC";
  return `${formatted} ${symbol}`;
}
