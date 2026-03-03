"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ArrowLeft, Package, Clock, Gavel, ShoppingCart, Truck, Loader2, Shield, ShieldCheck } from "lucide-react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { CONDITION_LABELS, LISTING_TYPE_LABELS, CATEGORY_LABELS, type ProductCategory } from "@/config/product-categories";
import { useProduct, useAuction, useProductAuction, useBuyProduct, useBuyProductInsured, usePlaceBid, useBuyNow } from "@/lib/useProducts";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const productId = params.id ? BigInt(params.id as string) : undefined;

  const { data: product, isLoading } = useProduct(productId);
  const { data: auctionId } = useProductAuction(productId);
  const { data: auction } = useAuction(auctionId && auctionId > 0n ? auctionId : undefined);

  const buyProduct = useBuyProduct();
  const buyInsured = useBuyProductInsured();
  const placeBid = usePlaceBid();
  const buyNow = useBuyNow();

  const [bidAmount, setBidAmount] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Insurance premium estimate (0.5% = 50 bps)
  const premiumBps = 50n;
  const price = product?.price ?? 0n;
  const premium = (price * premiumBps) / 10000n;

  const isSeller = product && address?.toLowerCase() === product.seller.toLowerCase();
  const isAuction = product?.listingType === 1;

  const handleBuy = async () => {
    if (!product || !contracts) return;
    setTxStatus("Purchasing...");
    try {
      await buyProduct.fn(productId!, product.price, BigInt(7 * 24 * 3600));
      setTxStatus("Purchase complete! Awaiting shipping.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleBuyInsured = async () => {
    if (!product || !contracts) return;
    setTxStatus("Purchasing with insurance...");
    try {
      await buyInsured.fn(productId!, product.price, BigInt(7 * 24 * 3600));
      setTxStatus("Insured purchase complete! Awaiting shipping.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleBid = async () => {
    if (!auctionId || !bidAmount) return;
    setTxStatus("Placing bid...");
    try {
      const amount = BigInt(Math.floor(parseFloat(bidAmount) * 1e18));
      await placeBid.fn(auctionId, amount);
      setTxStatus("Bid placed!");
      setBidAmount("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleBuyNow = async () => {
    if (!auctionId) return;
    setTxStatus("Buying now...");
    try {
      await buyNow.fn(auctionId, BigInt(7 * 24 * 3600));
      setTxStatus("Purchase complete!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
        <span className="ml-2 text-sm text-text-tertiary">Loading product...</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card px-4 py-20 text-center">
        <Package className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Product not found</p>
        <Link href="/products" className="text-xs text-lob-green mt-2 hover:underline inline-block">
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-4xl mx-auto">
      {/* Back nav */}
      <motion.div variants={fadeUp} className="mb-6">
        <button
          onClick={() => router.push("/products")}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Products
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Image */}
        <motion.div variants={fadeUp} className="card p-6">
          <div className="w-full aspect-square rounded bg-surface-3 flex items-center justify-center">
            <Package className="w-16 h-16 text-text-tertiary" />
          </div>
        </motion.div>

        {/* Right: Details */}
        <motion.div variants={fadeUp} className="space-y-4">
          <div className="card p-5">
            {/* Tags */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                {CONDITION_LABELS[product.condition]}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                {LISTING_TYPE_LABELS[product.listingType]}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                {CATEGORY_LABELS[product.productCategory as ProductCategory] ?? product.productCategory}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-lg font-bold text-text-primary mb-1">Product #{product.id.toString()}</h1>

            {/* Seller */}
            <p className="text-xs text-text-tertiary mb-4">
              Sold by{" "}
              <Link href={`/profile/${product.seller}`} className="text-text-secondary hover:text-lob-green transition-colors">
                {product.seller.slice(0, 6)}...{product.seller.slice(-4)}
              </Link>
            </p>

            {/* Stock */}
            <div className="flex items-center gap-3 text-xs text-text-secondary mb-4">
              <span>{Number(product.quantity) - Number(product.sold)} of {Number(product.quantity)} available</span>
              {product.requiresTracking && (
                <>
                  <span className="w-px h-3 bg-border/50" />
                  <span className="inline-flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Tracked shipping
                  </span>
                </>
              )}
            </div>

            {/* Auction info */}
            {isAuction && auction && (
              <div className="card p-3 mb-4 border-border/30 bg-surface-2">
                <h3 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                  <Gavel className="w-3 h-3" />
                  Auction Details
                </h3>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-text-tertiary">Current Bid: </span>
                    <span className="text-text-primary font-medium">
                      {auction.highBid > 0n ? `${parseFloat(formatEther(auction.highBid)).toLocaleString()} LOB` : "No bids"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Bids: </span>
                    <span className="text-text-primary font-medium tabular-nums">{Number(auction.bidCount)}</span>
                  </div>
                  {auction.reservePrice > 0n && (
                    <div>
                      <span className="text-text-tertiary">Reserve: </span>
                      <span className="text-text-primary font-medium">
                        {parseFloat(formatEther(auction.reservePrice)).toLocaleString()} LOB
                      </span>
                    </div>
                  )}
                  {auction.buyNowPrice > 0n && (
                    <div>
                      <span className="text-text-tertiary">Buy Now: </span>
                      <span className="text-lob-green font-medium">
                        {parseFloat(formatEther(auction.buyNowPrice)).toLocaleString()} LOB
                      </span>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-text-tertiary flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Ends: {new Date(Number(auction.endTime) * 1000).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {!isSeller && (
              <div className="space-y-2">
                {!isAuction ? (
                  <>
                    <motion.button
                      className="btn-primary w-full text-sm py-2 inline-flex items-center justify-center gap-2"
                      whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleBuy}
                      disabled={buyProduct.isPending || !address || Number(product.sold) >= Number(product.quantity)}
                    >
                      {buyProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                      Buy for {parseFloat(formatEther(product.price)).toLocaleString()} LOB
                    </motion.button>
                    <motion.button
                      className="w-full text-xs py-2 rounded border border-lob-green/50 text-lob-green hover:bg-lob-green/10 transition-colors inline-flex items-center justify-center gap-1.5"
                      whileTap={{ scale: 0.97 }}
                      onClick={handleBuyInsured}
                      disabled={buyInsured.isPending || !address || Number(product.sold) >= Number(product.quantity)}
                    >
                      {buyInsured.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                      Buy Insured ({parseFloat(formatEther(product.price + premium)).toLocaleString()} LOB)
                      <span className="text-text-tertiary ml-1">+{parseFloat(formatEther(premium)).toLocaleString()} premium</span>
                    </motion.button>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Bid amount (LOB)"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
                      />
                      <motion.button
                        className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleBid}
                        disabled={placeBid.isPending || !address || !bidAmount}
                      >
                        {placeBid.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gavel className="w-3 h-3" />}
                        Bid
                      </motion.button>
                    </div>
                    {auction && auction.buyNowPrice > 0n && auction.highBid < auction.buyNowPrice && (
                      <motion.button
                        className="w-full text-xs py-2 rounded border border-lob-green text-lob-green hover:bg-lob-green/10 transition-colors inline-flex items-center justify-center gap-1.5"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleBuyNow}
                        disabled={buyNow.isPending || !address}
                      >
                        {buyNow.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                        Buy Now for {parseFloat(formatEther(auction.buyNowPrice)).toLocaleString()} LOB
                      </motion.button>
                    )}
                  </>
                )}
              </div>
            )}

            {isSeller && (
              <p className="text-xs text-text-tertiary italic text-center py-2">This is your listing</p>
            )}

            {/* Tx status */}
            {txStatus && (
              <motion.div
                className={`mt-3 p-2 rounded text-xs ${txStatus.startsWith("Error") ? "bg-red-500/10 border border-red-500/30 text-red-400" : "bg-lob-green/10 border border-lob-green/30 text-lob-green"}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {txStatus}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
